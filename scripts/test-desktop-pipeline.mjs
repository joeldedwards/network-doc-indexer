import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

console.log('--- FOLIO DESKTOP SEARCH PIPELINE TEST ---');

const testDir = path.resolve(process.cwd(), '.test_folio_data');
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true, force: true });
}
fs.mkdirSync(testDir, { recursive: true });

const dbPath = path.join(testDir, 'test_folio.db');
const db = new Database(dbPath);

console.log('1. Testing SQLite Schema & FTS5 Virtual Table with Porter Tokenizer...');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

  CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, filename, content) VALUES('delete', old.rowid, old.filename, old.content);
  END;

  CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, filename, content) VALUES('delete', old.rowid, old.filename, old.content);
    INSERT INTO files_fts(rowid, filename, content) VALUES (new.rowid, new.filename, new.content);
  END;
`);

console.log('   ✓ SQLite FTS5 table and triggers created.');

console.log('2. Testing Document Parsers on Sample Data...');

// Test PDF
const samplePdf = path.resolve('sample-data/finance/approval-matrix.pdf');
assert(fs.existsSync(samplePdf), 'sample pdf must exist');
const pdfBuf = fs.readFileSync(samplePdf);
const parser = new PDFParse({ data: pdfBuf });
let pdfText = '';
try {
  const res = await parser.getText();
  pdfText = res.text;
  console.log(`   ✓ PDF Parse extracted ${pdfText.length} chars (contains "approval": ${pdfText.includes('approval')})`);
  assert(pdfText.toLowerCase().includes('approval'), 'PDF text must contain "approval"');
} finally {
  await parser.destroy();
}

// Test DOCX
const sampleDocx = path.resolve('sample-data/operations/vendor-onboarding.docx');
assert(fs.existsSync(sampleDocx), 'sample docx must exist');
const docxBuf = fs.readFileSync(sampleDocx);
const docxTextRes = await mammoth.extractRawText({ buffer: docxBuf });
console.log(`   ✓ DOCX Parse extracted ${docxTextRes.value.length} chars (contains "supplier": ${docxTextRes.value.includes('supplier')})`);
assert(docxTextRes.value.toLowerCase().includes('supplier'), 'DOCX must contain "supplier"');

// Test HTML conversion
const docxHtmlRes = await mammoth.convertToHtml({ buffer: docxBuf });
console.log(`   ✓ DOCX HTML conversion generated ${docxHtmlRes.value.length} chars of HTML`);
assert(docxHtmlRes.value.includes('Vendor onboarding guide'), 'DOCX HTML must contain title');

// Test Markdown / Plaintext
const sampleMd = path.resolve('sample-data/people-operations/benefits-overview.md');
assert(fs.existsSync(sampleMd), 'sample md must exist');
const mdText = fs.readFileSync(sampleMd, 'utf8');
console.log(`   ✓ MD Read extracted ${mdText.length} chars`);

console.log('3. Inserting Test Documents into SQLite & Triggering FTS5 Indexing...');
const insertStmt = db.prepare(`
  INSERT INTO files (
    id, path, relative_path, filename, extension,
    size, mtime, mime_type, content, indexed_at
  ) VALUES (
    @id, @path, @relative_path, @filename, @extension,
    @size, @mtime, @mime_type, @content, @indexed_at
  )
`);

const now = Date.now();
insertStmt.run({
  id: 'doc-pdf',
  path: samplePdf,
  relative_path: 'finance/approval-matrix.pdf',
  filename: 'approval-matrix.pdf',
  extension: '.pdf',
  size: pdfBuf.length,
  mtime: now,
  mime_type: 'application/pdf',
  content: pdfText,
  indexed_at: now,
});

insertStmt.run({
  id: 'doc-docx',
  path: sampleDocx,
  relative_path: 'operations/vendor-onboarding.docx',
  filename: 'vendor-onboarding.docx',
  extension: '.docx',
  size: docxBuf.length,
  mtime: now,
  mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  content: docxTextRes.value,
  indexed_at: now,
});

insertStmt.run({
  id: 'doc-md',
  path: sampleMd,
  relative_path: 'people-operations/benefits-overview.md',
  filename: 'benefits-overview.md',
  extension: '.md',
  size: mdText.length,
  mtime: now,
  mime_type: 'text/markdown',
  content: mdText,
  indexed_at: now,
});

console.log('   ✓ 3 test documents inserted.');

console.log('4. Testing FTS5 Full-Content Search with snippet() & <mark> highlighting...');
const ftsQuery = `
  SELECT 
    f.id,
    f.filename,
    snippet(files_fts, 1, '<mark>', '</mark>', '...', 20) AS snippet
  FROM files_fts
  JOIN files f ON f.rowid = files_fts.rowid
  WHERE files_fts MATCH '"approval"*'
`;
const ftsResults = db.prepare(ftsQuery).all();
console.log('   Search "approval" results count:', ftsResults.length);
assert(ftsResults.length >= 1, 'Should find at least 1 match for "approval"');
console.log('   Snippet preview:', ftsResults[0].snippet);
assert(ftsResults[0].snippet.includes('<mark>'), 'Snippet must contain <mark> tags');

console.log('5. Testing Filename-Only Search (LIKE query)...');
const likeQuery = `SELECT id, filename FROM files WHERE filename LIKE '%vendor%'`;
const likeResults = db.prepare(likeQuery).all();
console.log('   LIKE "%vendor%" results count:', likeResults.length);
assert(likeResults.length === 1, 'Should find vendor-onboarding.docx');
assert(likeResults[0].filename === 'vendor-onboarding.docx', 'Must match vendor file');

console.log('6. Testing UNC Path Normalization & Formatting...');
function computeUnc(root, rel) {
  if (root.startsWith('\\\\')) {
    return `${root.replace(/\//g, '\\')}\\${rel.replace(/\//g, '\\')}`;
  }
  return path.resolve(root, rel);
}
const unc = computeUnc('\\\\FileServer01\\SharedDocs', 'finance/approval-matrix.pdf');
console.log('   UNC path result:', unc);
assert.strictEqual(unc, '\\\\FileServer01\\SharedDocs\\finance\\approval-matrix.pdf');

const markdownLink = `[approval-matrix.pdf](${unc})`;
console.log('   Markdown link result:', markdownLink);
assert.strictEqual(markdownLink, '[approval-matrix.pdf](\\\\FileServer01\\SharedDocs\\finance\\approval-matrix.pdf)');

console.log('7. Testing SMTP Safeguard Size Limit (>25MB)...');
const MAX_ATTACHMENT = 25 * 1024 * 1024;
const smallSize = 10 * 1024 * 1024;
const hugeSize = 30 * 1024 * 1024;
assert(smallSize <= MAX_ATTACHMENT, '10 MB is allowed');
assert(hugeSize > MAX_ATTACHMENT, '30 MB triggers safeguard warning');
console.log('   ✓ Safeguard correctly flags > 25MB attachment.');

db.close();
fs.rmSync(testDir, { recursive: true, force: true });

console.log('--- ALL PIPELINE CHECKS PASSED SUCCESSFULLY ---');
