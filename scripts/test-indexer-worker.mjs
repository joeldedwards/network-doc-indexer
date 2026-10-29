import { Worker } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import Database from 'better-sqlite3';

console.log('--- TESTING INDEXER WORKER THREAD ---');

const testDir = path.resolve(process.cwd(), '.test_worker_data');
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true });
}
fs.mkdirSync(testDir, { recursive: true });

const dbPath = path.join(testDir, 'worker_test.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Setup schema
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
`);

db.close();

const workerPath = path.resolve('dist-electron/indexer-worker.js');
assert(fs.existsSync(workerPath), 'dist-electron/indexer-worker.js must exist');

const worker = new Worker(workerPath);
let completed = false;

worker.on('message', (msg) => {
  if (msg.type === 'PROGRESS') {
    console.log(`[Worker Progress] Phase: ${msg.status.phase}, Scanned: ${msg.status.discovered}, Indexed: ${msg.status.indexed}, Velocity: ${msg.status.velocity} f/s`);
    if (msg.status.phase === 'complete') {
      completed = true;
    }
  } else if (msg.type === 'ERROR') {
    console.error('[Worker Error]', msg.error);
    process.exit(1);
  }
});

worker.on('exit', () => {
  console.log('Worker thread finished.');
  const checkDb = new Database(dbPath);
  const rowCount = checkDb.prepare('SELECT COUNT(*) as count FROM files').get().count;
  const ftsCount = checkDb.prepare('SELECT COUNT(*) as count FROM files_fts').get().count;
  console.log(`Verified indexed files in SQLite: ${rowCount}`);
  console.log(`Verified FTS5 virtual table entries: ${ftsCount}`);
  assert(rowCount >= 5, 'Should have indexed all sample files');
  assert.strictEqual(rowCount, ftsCount, 'FTS count should match files count');

  // Test FTS search on the worker-indexed database
  const searchRow = checkDb.prepare(`
    SELECT f.filename, snippet(files_fts, 1, '<mark>', '</mark>', '...', 15) as snippet
    FROM files_fts
    JOIN files f ON f.rowid = files_fts.rowid
    WHERE files_fts MATCH '"matrix"*'
  `).get();

  console.log('FTS search result for "matrix":', searchRow);
  assert(searchRow && searchRow.filename === 'approval-matrix.pdf', 'Should find approval-matrix.pdf');

  checkDb.close();
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('--- WORKER THREAD TEST PASSED ---');
  process.exit(0);
});

worker.postMessage({
  type: 'START',
  config: {
    rootPath: './sample-data',
    includeExtensions: [
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
    ],
    excludePatterns: ['node_modules', '.git', '~$*', '*.tmp'],
    maxFileSizeBytes: 52428800,
    indexingFrequency: 'manual',
    backgroundSync: true,
    lastIndexedAt: null,
    indexedCount: 0,
  },
  dbPath,
});
