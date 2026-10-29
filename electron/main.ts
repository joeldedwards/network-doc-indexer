import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, session } from 'electron';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import type { IndexerConfig, IndexStatus, SearchQuery, SmtpEmailParams } from './types';
import {
  initDatabase,
  getDatabasePath,
  getConfig,
  saveConfig,
  getFileById,
  searchDocuments,
  getDocumentStats,
} from './database';
import { testTargetAccess, computeUncPath, computeFileUrl, computeMarkdownLink } from './network-utils';
import { generateDocumentPreview } from './preview-service';
import { sendEmailViaSmtp } from './mailer';
import { startWatcher, stopWatcher } from './watcher';

let mainWindow: BrowserWindow | null = null;
let indexerWorker: Worker | null = null;
let scheduledTimer: NodeJS.Timeout | null = null;

let currentStatus: IndexStatus = {
  running: false,
  phase: 'idle',
  discovered: 0,
  processed: 0,
  indexed: 0,
  skipped: 0,
  velocity: 0,
  currentDirectory: '',
  currentFile: null,
  startedAt: null,
  finishedAt: null,
  logs: [],
};

function createWindow(): BrowserWindow {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 620,
    title: 'Folio — Network Drive Search & Discovery',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#002654',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Strict Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' data: blob: http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline' http://localhost:*; font-src 'self' data: http://localhost:*; img-src 'self' data: blob: http://localhost:*; frame-src 'self' data: blob: http://localhost:*;",
        ],
      },
    });
  });

  const distIndex = path.join(__dirname, '../artifacts/document-discovery/dist/public/index.html');
  const devUrl = process.env.VITE_DEV_SERVER_URL;

  if (devUrl) {
    mainWindow.loadURL(devUrl).catch(() => {
      if (existsSync(distIndex)) {
        mainWindow?.loadFile(distIndex);
      }
    });
  } else if (existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function startIndexWorker(): { success: boolean; message: string } {
  if (indexerWorker || currentStatus.running) {
    return { success: false, message: 'An indexing run is already in progress.' };
  }

  const config = getConfig();
  if (!config) {
    return { success: false, message: 'Please configure your network target directory first.' };
  }

  currentStatus = {
    running: true,
    phase: 'scanning',
    discovered: 0,
    processed: 0,
    indexed: 0,
    skipped: 0,
    velocity: 0,
    currentDirectory: config.rootPath,
    currentFile: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logs: [],
  };

  const workerPath = path.join(__dirname, 'indexer-worker.js');
  const dbPath = getDatabasePath();

  try {
    indexerWorker = new Worker(workerPath);

    indexerWorker.on('message', (msg) => {
      if (msg.type === 'PROGRESS') {
        currentStatus = msg.status;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('indexer:progress', currentStatus);
        }
      } else if (msg.type === 'ERROR') {
        currentStatus.running = false;
        currentStatus.phase = 'error';
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('indexer:progress', currentStatus);
        }
      }
    });

    indexerWorker.on('error', (err) => {
      currentStatus.running = false;
      currentStatus.phase = 'error';
      indexerWorker = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('indexer:progress', currentStatus);
      }
    });

    indexerWorker.on('exit', () => {
      currentStatus.running = false;
      indexerWorker = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('indexer:progress', currentStatus);
      }
      // Re-sync watcher if background sync is on
      const currentConfig = getConfig();
      if (currentConfig?.backgroundSync) {
        startWatcher(currentConfig);
      }
    });

    indexerWorker.postMessage({
      type: 'START',
      config,
      dbPath,
    });

    return { success: true, message: 'Indexing started.' };
  } catch (err: unknown) {
    currentStatus.running = false;
    currentStatus.phase = 'error';
    const msg = err instanceof Error ? err.message : 'Failed to launch indexer';
    return { success: false, message: msg };
  }
}

function stopIndexWorker(): void {
  if (indexerWorker) {
    indexerWorker.postMessage({ type: 'STOP' });
  }
  currentStatus.running = false;
  currentStatus.phase = 'idle';
}

function syncSchedule(config: IndexerConfig) {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
  if (config.indexingFrequency === 'manual') return;

  const interval = config.indexingFrequency === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  scheduledTimer = setInterval(() => {
    void startIndexWorker();
  }, interval);
  scheduledTimer.unref();
}

// Register IPC handlers
function registerIpcHandlers() {
  ipcMain.handle('dialog:selectDirectory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Mapped Network Drive or Directory',
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('indexer:testTarget', async (_event, targetPath: string) => {
    return testTargetAccess(targetPath);
  });

  ipcMain.handle('indexer:getConfig', async () => {
    return getConfig();
  });

  ipcMain.handle('indexer:saveConfig', async (_event, config: IndexerConfig) => {
    const saved = saveConfig(config);
    if (saved.backgroundSync) {
      startWatcher(saved);
    } else {
      stopWatcher();
    }
    syncSchedule(saved);
    return saved;
  });

  ipcMain.handle('indexer:startIndex', async () => {
    return startIndexWorker();
  });

  ipcMain.handle('indexer:stopIndex', async () => {
    stopIndexWorker();
  });

  ipcMain.handle('indexer:getStatus', async () => {
    return currentStatus;
  });

  ipcMain.handle('search:query', async (_event, query: SearchQuery) => {
    return searchDocuments(query);
  });

  ipcMain.handle('search:getStats', async () => {
    return getDocumentStats();
  });

  ipcMain.handle('documents:get', async (_event, id: string) => {
    return getFileById(id);
  });

  ipcMain.handle('documents:preview', async (_event, id: string) => {
    return generateDocumentPreview(id);
  });

  ipcMain.handle('documents:getShareLinks', async (_event, id: string) => {
    const file = getFileById(id);
    if (!file) throw new Error('Document not found');
    const config = getConfig();
    const rootPath = config?.rootPath || '';
    const uncPath = computeUncPath(rootPath, file.relativePath);
    const fileUrl = computeFileUrl(file.path);
    const markdownLink = computeMarkdownLink(file.name, uncPath);
    return { uncPath, fileUrl, markdownLink };
  });

  ipcMain.handle('shell:showItemInFolder', async (_event, targetPath: string) => {
    if (existsSync(targetPath)) {
      shell.showItemInFolder(targetPath);
    } else {
      throw new Error('File does not exist on disk.');
    }
  });

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('email:sendSmtp', async (_event, params: SmtpEmailParams) => {
    return sendEmailViaSmtp(params);
  });
}

// App lifecycle
app.whenReady().then(() => {
  initDatabase();
  registerIpcHandlers();
  createWindow();

  // Initialize background watcher and schedule if configured
  const config = getConfig();
  if (config) {
    if (config.backgroundSync) {
      startWatcher(config);
    }
    syncSchedule(config);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopWatcher();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
