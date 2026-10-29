import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { app } from 'electron';
import type { DocumentItem, DocumentStats, IndexerConfig, SearchQuery, SearchResult } from './types';
import { computeFileUrl, computeUncPath } from './network-utils';

let dbInstance: Database.Database | null = null;

export function getDatabasePath(): string {
  // If app is defined (inside Electron runtime), use app.getPath('userData')
  if (app && typeof app.getPath === 'function') {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    return path.join(userDataPath, 'folio_search.db');
  }
  // Fallback for standalone scripts / tests
  const localDir = path.resolve(process.cwd(), '.folio_data');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return path.join(localDir, 'folio_search.db');
}

export function initDatabase(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = getDatabasePath();
  const db = new Database(dbPath);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      root_path TEXT NOT NULL,
      include_extensions TEXT NOT NULL,
      exclude_patterns TEXT NOT NULL,
      max_file_size_bytes INTEGER NOT NULL DEFAULT 52428800,
      indexing_frequency TEXT NOT NULL DEFAULT 'manual',
      background_sync INTEGER NOT NULL DEFAULT 1,
      last_indexed_at TEXT,
      indexed_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      relative_path TEXT NOT NULL,
      filename TEXT NOT NULL,
      extension TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      indexed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
    CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
    CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime);
    CREATE INDEX IF NOT EXISTS idx_files_size ON files(size);

    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      filename,
      content,
      content='files',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, filename, content) VALUES (new.rowid, new.filename, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, filename, content) VALUES('delete', old.rowid, old.filename, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, filename, content) VALUES('delete', old.rowid, old.filename, old.content);
      INSERT INTO files_fts(rowid, filename, content) VALUES (new.rowid, new.filename, new.content);
    END;
  `);

  dbInstance = db;
  return db;
}

export function getConfig(): IndexerConfig | null {
  const db = initDatabase();
  const row = db.prepare('SELECT * FROM config WHERE id = 1').get() as {
    root_path: string;
    include_extensions: string;
    exclude_patterns: string;
    max_file_size_bytes: number;
    indexing_frequency: 'manual' | 'hourly' | 'daily';
    background_sync: number;
    last_indexed_at: string | null;
    indexed_count: number;
  } | undefined;

  if (!row) return null;

  try {
    let includeExtensions: string[] = JSON.parse(row.include_extensions);
    // Automatically upgrade legacy 7-item default extension list to include spreadsheet formats
    const legacyDefaults = ['.pdf', '.docx', '.txt', '.csv', '.md', '.log', '.json'];
    const isLegacyDefault =
      includeExtensions.length === legacyDefaults.length &&
      legacyDefaults.every(ext => includeExtensions.includes(ext));
    if (isLegacyDefault) {
      includeExtensions = [
        '.pdf',
        '.docx',
        '.xlsx',
        '.xls',
        '.xlsm',
        '.ods',
        '.csv',
        '.tsv',
        '.txt',
        '.md',
        '.log',
        '.json',
      ];
      db.prepare('UPDATE config SET include_extensions = ? WHERE id = 1').run(
        JSON.stringify(includeExtensions)
      );
    }

    return {
      rootPath: row.root_path,
      includeExtensions,
      excludePatterns: JSON.parse(row.exclude_patterns),
      maxFileSizeBytes: row.max_file_size_bytes,
      indexingFrequency: row.indexing_frequency,
      backgroundSync: Boolean(row.background_sync),
      lastIndexedAt: row.last_indexed_at,
      indexedCount: row.indexed_count,
    };
  } catch {
    return null;
  }
}

export function saveConfig(config: IndexerConfig): IndexerConfig {
  const db = initDatabase();
  const stmt = db.prepare(`
    INSERT INTO config (
      id, root_path, include_extensions, exclude_patterns,
      max_file_size_bytes, indexing_frequency, background_sync,
      last_indexed_at, indexed_count
    ) VALUES (
      1, @root_path, @include_extensions, @exclude_patterns,
      @max_file_size_bytes, @indexing_frequency, @background_sync,
      @last_indexed_at, @indexed_count
    )
    ON CONFLICT(id) DO UPDATE SET
      root_path = excluded.root_path,
      include_extensions = excluded.include_extensions,
      exclude_patterns = excluded.exclude_patterns,
      max_file_size_bytes = excluded.max_file_size_bytes,
      indexing_frequency = excluded.indexing_frequency,
      background_sync = excluded.background_sync,
      last_indexed_at = COALESCE(excluded.last_indexed_at, config.last_indexed_at),
      indexed_count = COALESCE(excluded.indexed_count, config.indexed_count)
  `);

  stmt.run({
    root_path: config.rootPath,
    include_extensions: JSON.stringify(config.includeExtensions),
    exclude_patterns: JSON.stringify(config.excludePatterns),
    max_file_size_bytes: config.maxFileSizeBytes,
    indexing_frequency: config.indexingFrequency,
    background_sync: config.backgroundSync ? 1 : 0,
    last_indexed_at: config.lastIndexedAt ?? null,
    indexed_count: config.indexedCount ?? 0,
  });

  return config;
}

export function updateIndexedStats(indexedCount: number, lastIndexedAt: string) {
  const db = initDatabase();
  db.prepare(`
    UPDATE config SET
      indexed_count = ?,
      last_indexed_at = ?
    WHERE id = 1
  `).run(indexedCount, lastIndexedAt);
}

export interface FileRecordInput {
  id: string;
  path: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  mtime: number;
  mimeType: string;
  content: string;
}

export function upsertFile(file: FileRecordInput) {
  const db = initDatabase();
  const stmt = db.prepare(`
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

  stmt.run({
    id: file.id,
    path: file.path,
    relative_path: file.relativePath,
    filename: file.filename,
    extension: file.extension,
    size: file.size,
    mtime: file.mtime,
    mime_type: file.mimeType,
    content: file.content,
    indexed_at: Date.now(),
  });
}

export function batchUpsertFiles(files: FileRecordInput[]) {
  if (!files.length) return;
  const db = initDatabase();
  const stmt = db.prepare(`
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

  const insertMany = db.transaction((items: FileRecordInput[]) => {
    const now = Date.now();
    for (const item of items) {
      stmt.run({
        id: item.id,
        path: item.path,
        relative_path: item.relativePath,
        filename: item.filename,
        extension: item.extension,
        size: item.size,
        mtime: item.mtime,
        mime_type: item.mimeType,
        content: item.content,
        indexed_at: now,
      });
    }
  });

  insertMany(files);
}

export function deleteFileByPath(filePath: string) {
  const db = initDatabase();
  db.prepare('DELETE FROM files WHERE path = ?').run(filePath);
}

export function pruneMissingFiles(existingPaths: Set<string>) {
  const db = initDatabase();
  const allRows = db.prepare('SELECT path FROM files').all() as { path: string }[];
  const toDelete = allRows.filter(r => !existingPaths.has(r.path));
  if (!toDelete.length) return 0;

  const deleteStmt = db.prepare('DELETE FROM files WHERE path = ?');
  const deleteTx = db.transaction((items: { path: string }[]) => {
    for (const item of items) {
      deleteStmt.run(item.path);
    }
  });
  deleteTx(toDelete);
  return toDelete.length;
}

export function getFileById(id: string): DocumentItem | null {
  const db = initDatabase();
  const config = getConfig();
  const rootPath = config?.rootPath || '';
  const row = db.prepare('SELECT id, path, relative_path, filename, extension, size, mtime, mime_type, substr(content, 1, 300) as snippet FROM files WHERE id = ?').get(id) as {
    id: string;
    path: string;
    relative_path: string;
    filename: string;
    extension: string;
    size: number;
    mtime: number;
    mime_type: string;
    snippet: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    path: row.path,
    relativePath: row.relative_path,
    name: row.filename,
    extension: row.extension,
    sizeBytes: row.size,
    modifiedAt: new Date(row.mtime).toISOString(),
    mimeType: row.mime_type,
    snippet: row.snippet,
    uncPath: computeUncPath(rootPath, row.relative_path),
    fileUrl: computeFileUrl(row.path),
  };
}

export function searchDocuments(query: SearchQuery): SearchResult {
  const db = initDatabase();
  const config = getConfig();
  const rootPath = config?.rootPath || '';
  const startTime = Date.now();

  const conditions: string[] = [];
  const params: unknown[] = [];

  const rawTerm = (query.q || '').trim();
  const mode = query.mode || 'content';

  if (query.extension) {
    const ext = query.extension.startsWith('.') ? query.extension.toLowerCase() : `.${query.extension.toLowerCase()}`;
    conditions.push('f.extension = ?');
    params.push(ext);
  }

  if (query.modifiedAfter) {
    const timeMs = new Date(query.modifiedAfter).getTime();
    if (!isNaN(timeMs)) {
      conditions.push('f.mtime >= ?');
      params.push(timeMs);
    }
  }

  if (query.modifiedBefore) {
    const timeMs = new Date(`${query.modifiedBefore}T23:59:59.999Z`).getTime();
    if (!isNaN(timeMs)) {
      conditions.push('f.mtime <= ?');
      params.push(timeMs);
    }
  }

  if (typeof query.minSizeBytes === 'number' && !isNaN(query.minSizeBytes)) {
    conditions.push('f.size >= ?');
    params.push(query.minSizeBytes);
  }

  if (typeof query.maxSizeBytes === 'number' && !isNaN(query.maxSizeBytes)) {
    conditions.push('f.size <= ?');
    params.push(query.maxSizeBytes);
  }

  const limit = Math.min(query.limit || 50, 100);

  let sql = '';
  let countSql = '';

  if (rawTerm && mode === 'content') {
    // FTS5 MATCH search
    // Sanitize search term for FTS5 syntax
    const cleaned = rawTerm.replace(/['"*]/g, ' ').trim();
    const ftsTokens = cleaned.split(/\s+/).filter(Boolean);
    const ftsQuery = ftsTokens.map(token => `"${token}"*`).join(' AND ');

    if (!ftsTokens.length) {
      return { results: [], totalCount: 0, queryDurationMs: Date.now() - startTime };
    }

    const whereClause = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

    sql = `
      SELECT 
        f.id,
        f.path,
        f.relative_path,
        f.filename,
        f.extension,
        f.size,
        f.mtime,
        f.mime_type,
        snippet(files_fts, 1, '<mark>', '</mark>', '...', 24) AS snippet,
        bm25(files_fts) as rank
      FROM files_fts
      JOIN files f ON f.rowid = files_fts.rowid
      WHERE files_fts MATCH ? ${whereClause}
      ORDER BY rank ASC, f.mtime DESC
      LIMIT ?
    `;

    countSql = `
      SELECT COUNT(*) as total
      FROM files_fts
      JOIN files f ON f.rowid = files_fts.rowid
      WHERE files_fts MATCH ? ${whereClause}
    `;

    const countParams = [ftsQuery, ...params];
    const selectParams = [ftsQuery, ...params, limit];

    try {
      const countRow = db.prepare(countSql).get(...countParams) as { total: number };
      const rows = db.prepare(sql).all(...selectParams) as {
        id: string;
        path: string;
        relative_path: string;
        filename: string;
        extension: string;
        size: number;
        mtime: number;
        mime_type: string;
        snippet: string;
      }[];

      const results: DocumentItem[] = rows.map(r => ({
        id: r.id,
        path: r.path,
        relativePath: r.relative_path,
        name: r.filename,
        extension: r.extension,
        sizeBytes: r.size,
        modifiedAt: new Date(r.mtime).toISOString(),
        mimeType: r.mime_type,
        snippet: r.snippet || r.filename,
        uncPath: computeUncPath(rootPath, r.relative_path),
        fileUrl: computeFileUrl(r.path),
      }));

      return {
        results,
        totalCount: countRow?.total ?? 0,
        queryDurationMs: Date.now() - startTime,
      };
    } catch {
      // If FTS MATCH fails syntax (e.g. malformed query), fallback to LIKE
    }
  }

  // Filename or fallback LIKE search
  if (rawTerm) {
    conditions.push('f.filename LIKE ?');
    params.push(`%${rawTerm}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  sql = `
    SELECT 
      f.id,
      f.path,
      f.relative_path,
      f.filename,
      f.extension,
      f.size,
      f.mtime,
      f.mime_type,
      f.filename AS snippet
    FROM files f
    ${whereClause}
    ORDER BY f.mtime DESC
    LIMIT ?
  `;

  countSql = `SELECT COUNT(*) as total FROM files f ${whereClause}`;

  const countRow = db.prepare(countSql).get(...params) as { total: number };
  const rows = db.prepare(sql).all(...params, limit) as {
    id: string;
    path: string;
    relative_path: string;
    filename: string;
    extension: string;
    size: number;
    mtime: number;
    mime_type: string;
    snippet: string;
  }[];

  const results: DocumentItem[] = rows.map(r => ({
    id: r.id,
    path: r.path,
    relativePath: r.relative_path,
    name: r.filename,
    extension: r.extension,
    sizeBytes: r.size,
    modifiedAt: new Date(r.mtime).toISOString(),
    mimeType: r.mime_type,
    snippet: r.snippet,
    uncPath: computeUncPath(rootPath, r.relative_path),
    fileUrl: computeFileUrl(r.path),
  }));

  return {
    results,
    totalCount: countRow?.total ?? 0,
    queryDurationMs: Date.now() - startTime,
  };
}

export function getDocumentStats(): DocumentStats {
  const db = initDatabase();
  const totals = db.prepare('SELECT COUNT(*) as totalDocs, COALESCE(SUM(size), 0) as totalBytes FROM files').get() as {
    totalDocs: number;
    totalBytes: number;
  };

  const typeRows = db.prepare('SELECT extension, COUNT(*) as count FROM files GROUP BY extension ORDER BY count DESC').all() as {
    extension: string;
    count: number;
  }[];

  return {
    totalDocuments: totals.totalDocs || 0,
    totalBytes: totals.totalBytes || 0,
    typeCounts: typeRows,
  };
}
