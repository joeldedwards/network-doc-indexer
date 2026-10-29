import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';
import chokidar, { FSWatcher } from 'chokidar';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import type { IndexerConfig } from './types';
import { upsertFile, deleteFileByPath, getConfig } from './database';
import { extractSpreadsheetTextFromBuffer, isSpreadsheetExtension } from './spreadsheet-parser';

let activeWatcher: FSWatcher | null = null;

function isExcluded(relativePath: string, fileName: string, patterns: string[]): boolean {
  if (fileName.startsWith('.')) return true;
  if (fileName.startsWith('~$')) return true;

  const parts = relativePath.split(path.sep);
  if (parts.some(p => p.startsWith('.'))) return true;

  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern === fileName || parts.includes(pattern)) return true;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try {
      const regex = new RegExp(`^${escaped}$`, 'i');
      if (regex.test(fileName) || regex.test(relativePath.replace(/\\/g, '/'))) return true;
    } catch {}
  }
  return false;
}

function getMimeType(extension: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
    '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.log': 'text/plain',
    '.json': 'application/json',
  };
  return map[extension.toLowerCase()] || 'application/octet-stream';
}

async function extractText(filePath: string, ext: string): Promise<string> {
  const extension = ext.toLowerCase();
  if (extension === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const res = await parser.getText();
      return (res.text || '').slice(0, 2_000_000);
    } finally {
      await parser.destroy();
    }
  }

  if (extension === '.docx') {
    const buffer = await fs.readFile(filePath);
    const res = await mammoth.extractRawText({ buffer });
    return (res.value || '').slice(0, 2_000_000);
  }

  if (isSpreadsheetExtension(extension)) {
    const buffer = await fs.readFile(filePath);
    return extractSpreadsheetTextFromBuffer(buffer, extension, 2_000_000);
  }

  const buffer = await fs.readFile(filePath);
  return buffer.toString('utf8').replace(/\0/g, '').slice(0, 2_000_000);
}

async function handleFileUpsert(filePath: string, rootPath: string, config: IndexerConfig) {
  try {
    const relPath = path.relative(rootPath, filePath);
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (isExcluded(relPath, filename, config.excludePatterns)) return;

    const allowed = new Set(config.includeExtensions.map(e => e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`));
    if (!allowed.has(ext)) return;

    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > config.maxFileSizeBytes) return;

    const content = await extractText(filePath, ext);
    upsertFile({
      id: crypto.randomUUID(),
      path: filePath,
      relativePath: relPath,
      filename,
      extension: ext,
      size: stat.size,
      mtime: Math.floor(stat.mtimeMs),
      mimeType: getMimeType(ext),
      content,
    });
  } catch {
    // Ignore transient file lock / read errors
  }
}

export function stopWatcher() {
  if (activeWatcher) {
    activeWatcher.close().catch(() => {});
    activeWatcher = null;
  }
}

export function startWatcher(config: IndexerConfig) {
  stopWatcher();

  if (!config.backgroundSync) {
    return;
  }

  const root = path.resolve(config.rootPath);
  if (!existsSync(root)) return;

  const watcher = chokidar.watch(root, {
    ignored: /(^|[/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // initial crawl handles existing files
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 200,
    },
    depth: 99,
  });

  watcher
    .on('add', (filePath) => {
      void handleFileUpsert(filePath, root, config);
    })
    .on('change', (filePath) => {
      void handleFileUpsert(filePath, root, config);
    })
    .on('unlink', (filePath) => {
      deleteFileByPath(filePath);
    })
    .on('error', () => {
      // Ignore watcher network errors
    });

  activeWatcher = watcher;
}

export function syncWatcherFromConfig() {
  const config = getConfig();
  if (config) {
    startWatcher(config);
  }
}
