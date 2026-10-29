import { parentPort } from 'node:worker_threads';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import type { IndexerConfig, IndexLogEntry, IndexStatus } from './types';
import { extractSpreadsheetTextFromBuffer, isSpreadsheetExtension } from './spreadsheet-parser';

let shouldStop = false;
let db: Database.Database | null = null;

const MAX_INDEXED_TEXT_CHARS = 2_000_000;
const BATCH_SIZE = 25;

function isExcluded(
  relativePath: string,
  fileName: string,
  excludePatterns: string[]
): boolean {
  // Always ignore hidden files/folders
  if (fileName.startsWith('.')) return true;
  // Always ignore Office temporary lock files (~$*)
  if (fileName.startsWith('~$')) return true;

  const parts = relativePath.split(path.sep);
  if (parts.some(p => p.startsWith('.'))) return true;

  for (const raw of excludePatterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern === fileName || parts.includes(pattern)) return true;

    // Convert wildcard pattern to regex (e.g. *.tmp, ~$*)
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try {
      const regex = new RegExp(`^${escaped}$`, 'i');
      if (regex.test(fileName) || regex.test(relativePath.replace(/\\/g, '/'))) {
        return true;
      }
    } catch {
      // ignore regex parse failure
    }
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

async function extractFileText(filePath: string, extension: string): Promise<string> {
  const ext = extension.toLowerCase();

  if (ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return (result.text || '').slice(0, MAX_INDEXED_TEXT_CHARS);
    } finally {
      await parser.destroy();
    }
  }

  if (ext === '.docx') {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || '').slice(0, MAX_INDEXED_TEXT_CHARS);
  }

  if (isSpreadsheetExtension(ext)) {
    const buffer = await fs.readFile(filePath);
    return extractSpreadsheetTextFromBuffer(buffer, ext, MAX_INDEXED_TEXT_CHARS);
  }

  // Plaintext / Markdown / Logs / JSON
  const buffer = await fs.readFile(filePath);
  return buffer
    .toString('utf8')
    .replace(/\0/g, '')
    .slice(0, MAX_INDEXED_TEXT_CHARS);
}

interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  mtime: number;
}

async function runCrawlAndIndex(config: IndexerConfig, dbPath: string) {
  shouldStop = false;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const root = path.resolve(config.rootPath);
  if (!existsSync(root)) {
    throw new Error(`Configured root directory does not exist: ${config.rootPath}`);
  }

  const logs: IndexLogEntry[] = [];
  const addLog = (level: 'info' | 'warn' | 'error', targetPath: string, reason: string) => {
    const entry: IndexLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toLocaleTimeString(),
      level,
      path: targetPath,
      reason,
    };
    logs.unshift(entry);
    if (logs.length > 100) logs.pop();
  };

  const status: IndexStatus = {
    running: true,
    phase: 'scanning',
    discovered: 0,
    processed: 0,
    indexed: 0,
    skipped: 0,
    velocity: 0,
    currentDirectory: root,
    currentFile: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logs,
  };

  const allowedExts = new Set(
    config.includeExtensions.map(e => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
  );

  const velocityWindow: number[] = [];
  let lastProgressReportTime = 0;

  const reportProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressReportTime < 120) return;
    lastProgressReportTime = now;

    // Prune velocity window older than 3 seconds
    while (velocityWindow.length && velocityWindow[0] < now - 3000) {
      velocityWindow.shift();
    }
    const currentVelocity = velocityWindow.length ? Math.round((velocityWindow.length / 3) * 10) / 10 : 0;
    status.velocity = currentVelocity;
    status.logs = logs.slice(0, 50);

    if (parentPort) {
      parentPort.postMessage({ type: 'PROGRESS', status });
    }
  };

  reportProgress(true);

  // Phase 1: Scan and Discover
  const discoveredFiles: DiscoveredFile[] = [];

  async function walk(dir: string): Promise<void> {
    if (shouldStop) return;
    status.currentDirectory = dir;
    reportProgress();

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cannot read directory';
      addLog('error', path.relative(root, dir) || '.', `Directory read permission error: ${msg}`);
      return;
    }

    for (const entry of entries) {
      if (shouldStop) return;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath);

      if (isExcluded(relPath, entry.name, config.excludePatterns)) {
        continue;
      }

      if (entry.isSymbolicLink()) {
        // Skip symlinks to prevent directory escape
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedExts.has(ext)) {
        continue;
      }

      try {
        const stats = await fs.stat(fullPath);
        if (stats.size > config.maxFileSizeBytes) {
          status.skipped++;
          status.processed++;
          addLog('warn', relPath, `Skipped: Exceeds size limit (${Math.round(stats.size / (1024 * 1024))} MB > ${Math.round(config.maxFileSizeBytes / (1024 * 1024))} MB)`);
          continue;
        }

        discoveredFiles.push({
          absolutePath: fullPath,
          relativePath: relPath,
          filename: entry.name,
          extension: ext,
          size: stats.size,
          mtime: stats.mtimeMs,
        });

        status.discovered = discoveredFiles.length + status.skipped;
        reportProgress();
      } catch (statErr: unknown) {
        status.skipped++;
        status.processed++;
        const msg = statErr instanceof Error ? statErr.message : 'Cannot read metadata';
        addLog('warn', relPath, `Skipped: ${msg}`);
      }
    }
  }

  addLog('info', root, 'Starting directory discovery crawl...');
  await walk(root);

  if (shouldStop) {
    status.running = false;
    status.phase = 'idle';
    status.finishedAt = new Date().toISOString();
    reportProgress(true);
    return;
  }

  // Phase 2: Extract text and index into SQLite
  status.phase = 'indexing';
  addLog('info', '.', `Discovered ${discoveredFiles.length} candidate documents to index.`);
  reportProgress(true);

  const upsertStmt = db.prepare(`
    INSERT INTO files (
      id, path, relative_path, filename, extension,
      size, mtime, mime_type, content, indexed_at
    ) VALUES (
      @id, @path, @relative_path, @filename, @extension,
      @size, @mtime, @mime_type, @content, @indexed_at
    )
    ON CONFLICT(path) DO UPDATE SET
      relative_path = excluded.relative_path,
      filename = excluded.filename,
      extension = excluded.extension,
      size = excluded.size,
      mtime = excluded.mtime,
      mime_type = excluded.mime_type,
      content = excluded.content,
      indexed_at = excluded.indexed_at
  `);

  const batchUpsertTx = db.transaction((items: Array<{
    id: string;
    path: string;
    relative_path: string;
    filename: string;
    extension: string;
    size: number;
    mtime: number;
    mime_type: string;
    content: string;
    indexed_at: number;
  }>) => {
    for (const item of items) {
      upsertStmt.run(item);
    }
  });

  let currentBatch: Array<{
    id: string;
    path: string;
    relative_path: string;
    filename: string;
    extension: string;
    size: number;
    mtime: number;
    mime_type: string;
    content: string;
    indexed_at: number;
  }> = [];

  const seenPaths = new Set<string>();

  for (const file of discoveredFiles) {
    if (shouldStop) break;

    status.currentFile = file.relativePath;
    seenPaths.add(file.absolutePath);

    try {
      const content = await extractFileText(file.absolutePath, file.extension);
      const mimeType = getMimeType(file.extension);

      currentBatch.push({
        id: crypto.randomUUID(),
        path: file.absolutePath,
        relative_path: file.relativePath,
        filename: file.filename,
        extension: file.extension,
        size: file.size,
        mtime: Math.floor(file.mtime),
        mime_type: mimeType,
        content,
        indexed_at: Date.now(),
      });

      status.indexed++;
      velocityWindow.push(Date.now());
    } catch (parseErr: unknown) {
      status.skipped++;
      const msg = parseErr instanceof Error ? parseErr.message : 'Text extraction failed';
      addLog('warn', file.relativePath, `Text extraction error: ${msg}`);
    } finally {
      status.processed++;
      reportProgress();
    }

    if (currentBatch.length >= BATCH_SIZE) {
      batchUpsertTx(currentBatch);
      currentBatch = [];
    }
  }

  if (currentBatch.length > 0) {
    batchUpsertTx(currentBatch);
    currentBatch = [];
  }

  // Phase 3: Prune deleted files
  if (!shouldStop) {
    const existingRows = db.prepare('SELECT path FROM files').all() as { path: string }[];
    const toDelete = existingRows.filter(r => !seenPaths.has(r.path));
    if (toDelete.length > 0) {
      const delStmt = db.prepare('DELETE FROM files WHERE path = ?');
      const delTx = db.transaction((rows: { path: string }[]) => {
        for (const row of rows) {
          delStmt.run(row.path);
        }
      });
      delTx(toDelete);
      addLog('info', '.', `Pruned ${toDelete.length} removed files from search index.`);
    }

    // Update config stats
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE config SET indexed_count = ?, last_indexed_at = ? WHERE id = 1').run(
      status.indexed,
      nowIso
    );
  }

  status.running = false;
  status.phase = shouldStop ? 'idle' : 'complete';
  status.finishedAt = new Date().toISOString();
  status.currentFile = null;
  addLog('info', '.', `Indexing complete. ${status.indexed} files successfully indexed, ${status.skipped} skipped.`);
  reportProgress(true);
  db.close();
  db = null;
}

if (parentPort) {
  parentPort.on('message', async (msg) => {
    if (msg.type === 'START') {
      try {
        await runCrawlAndIndex(msg.config, msg.dbPath);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown crawl failure';
        if (parentPort) {
          parentPort.postMessage({
            type: 'ERROR',
            error: errorMsg,
          });
        }
      } finally {
        if (db) {
          try {
            db.close();
          } catch {}
          db = null;
        }
        parentPort?.close();
      }
    } else if (msg.type === 'STOP') {
      shouldStop = true;
    }
  });
}
