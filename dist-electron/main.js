"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron2 = require("electron");
var import_node_path4 = __toESM(require("node:path"));
var import_node_worker_threads = require("node:worker_threads");
var import_node_fs4 = require("node:fs");

// electron/database.ts
var import_node_path2 = __toESM(require("node:path"));
var import_node_fs = __toESM(require("node:fs"));
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_electron = require("electron");

// electron/network-utils.ts
var import_node_path = __toESM(require("node:path"));
var import_promises = __toESM(require("node:fs/promises"));
var import_node_url = require("node:url");
function isUncPath(targetPath) {
  if (!targetPath) return false;
  const trimmed = targetPath.trim();
  return /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(trimmed);
}
function computeUncPath(rootPath, relativePath) {
  const normRoot = rootPath.trim();
  const normRel = relativePath.replace(/^[\\/]+/, "");
  if (isUncPath(normRoot)) {
    const cleanRoot = normRoot.replace(/\//g, "\\").replace(/\\+$/, "");
    const cleanRel = normRel.replace(/\//g, "\\");
    return `${cleanRoot}\\${cleanRel}`;
  }
  if (/^[A-Za-z]:[\\/]/.test(normRoot)) {
    const cleanRoot = normRoot.replace(/\//g, "\\").replace(/\\+$/, "");
    const cleanRel = normRel.replace(/\//g, "\\");
    return `${cleanRoot}\\${cleanRel}`;
  }
  return import_node_path.default.resolve(normRoot, normRel);
}
function computeFileUrl(absolutePath) {
  try {
    return (0, import_node_url.pathToFileURL)(absolutePath).href;
  } catch {
    return `file://${absolutePath.replace(/\\/g, "/")}`;
  }
}
function computeMarkdownLink(docName, uncOrFullPath) {
  return `[${docName}](${uncOrFullPath})`;
}
async function testTargetAccess(targetPath, timeoutMs = 3500) {
  const trimmed = (targetPath || "").trim();
  if (!trimmed) {
    return {
      accessible: false,
      path: "",
      isUnc: false,
      normalizedPath: "",
      latencyMs: 0,
      fileCount: 0,
      error: "Please enter or select a directory path."
    };
  }
  const isUnc = isUncPath(trimmed);
  const normalizedPath = isUnc ? trimmed.replace(/\//g, "\\") : import_node_path.default.resolve(trimmed);
  const startTime = Date.now();
  try {
    const accessPromise = async () => {
      await import_promises.default.access(normalizedPath, import_promises.default.constants.R_OK);
      const stats = await import_promises.default.stat(normalizedPath);
      if (!stats.isDirectory()) {
        throw new Error("Target is not a directory.");
      }
      const entries = await import_promises.default.readdir(normalizedPath, { withFileTypes: true });
      let fileCount = 0;
      for (const entry of entries) {
        if (!entry.name.startsWith(".")) {
          fileCount++;
        }
      }
      return { fileCount };
    };
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Network drive timed out or unreachable. Connection took longer than 3.5 seconds."));
      }, timeoutMs);
    });
    const result = await Promise.race([accessPromise(), timeoutPromise]);
    const latencyMs = Date.now() - startTime;
    return {
      accessible: true,
      path: trimmed,
      isUnc,
      normalizedPath,
      latencyMs,
      fileCount: result.fileCount
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Directory could not be reached.";
    return {
      accessible: false,
      path: trimmed,
      isUnc,
      normalizedPath,
      latencyMs,
      fileCount: 0,
      error: `Network drive disconnected or unreachable: ${message}`
    };
  }
}

// electron/database.ts
var dbInstance = null;
function getDatabasePath() {
  if (import_electron.app && typeof import_electron.app.getPath === "function") {
    const userDataPath = import_electron.app.getPath("userData");
    if (!import_node_fs.default.existsSync(userDataPath)) {
      import_node_fs.default.mkdirSync(userDataPath, { recursive: true });
    }
    return import_node_path2.default.join(userDataPath, "folio_search.db");
  }
  const localDir = import_node_path2.default.resolve(process.cwd(), ".folio_data");
  if (!import_node_fs.default.existsSync(localDir)) {
    import_node_fs.default.mkdirSync(localDir, { recursive: true });
  }
  return import_node_path2.default.join(localDir, "folio_search.db");
}
function initDatabase() {
  if (dbInstance) return dbInstance;
  const dbPath = getDatabasePath();
  const db = new import_better_sqlite3.default(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
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
function getConfig() {
  const db = initDatabase();
  const row = db.prepare("SELECT * FROM config WHERE id = 1").get();
  if (!row) return null;
  try {
    let includeExtensions = JSON.parse(row.include_extensions);
    const legacyDefaults = [".pdf", ".docx", ".txt", ".csv", ".md", ".log", ".json"];
    const isLegacyDefault = includeExtensions.length === legacyDefaults.length && legacyDefaults.every((ext) => includeExtensions.includes(ext));
    if (isLegacyDefault) {
      includeExtensions = [
        ".pdf",
        ".docx",
        ".xlsx",
        ".xls",
        ".xlsm",
        ".ods",
        ".csv",
        ".tsv",
        ".txt",
        ".md",
        ".log",
        ".json"
      ];
      db.prepare("UPDATE config SET include_extensions = ? WHERE id = 1").run(
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
      indexedCount: row.indexed_count
    };
  } catch {
    return null;
  }
}
function saveConfig(config) {
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
    indexed_count: config.indexedCount ?? 0
  });
  return config;
}
function upsertFile(file) {
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
    indexed_at: Date.now()
  });
}
function deleteFileByPath(filePath) {
  const db = initDatabase();
  db.prepare("DELETE FROM files WHERE path = ?").run(filePath);
}
function getFileById(id) {
  const db = initDatabase();
  const config = getConfig();
  const rootPath = config?.rootPath || "";
  const row = db.prepare("SELECT id, path, relative_path, filename, extension, size, mtime, mime_type, substr(content, 1, 300) as snippet FROM files WHERE id = ?").get(id);
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
    fileUrl: computeFileUrl(row.path)
  };
}
function searchDocuments(query) {
  const db = initDatabase();
  const config = getConfig();
  const rootPath = config?.rootPath || "";
  const startTime = Date.now();
  const conditions = [];
  const params = [];
  const rawTerm = (query.q || "").trim();
  const mode = query.mode || "content";
  if (query.extension) {
    const ext = query.extension.startsWith(".") ? query.extension.toLowerCase() : `.${query.extension.toLowerCase()}`;
    conditions.push("f.extension = ?");
    params.push(ext);
  }
  if (query.modifiedAfter) {
    const timeMs = new Date(query.modifiedAfter).getTime();
    if (!isNaN(timeMs)) {
      conditions.push("f.mtime >= ?");
      params.push(timeMs);
    }
  }
  if (query.modifiedBefore) {
    const timeMs = (/* @__PURE__ */ new Date(`${query.modifiedBefore}T23:59:59.999Z`)).getTime();
    if (!isNaN(timeMs)) {
      conditions.push("f.mtime <= ?");
      params.push(timeMs);
    }
  }
  if (typeof query.minSizeBytes === "number" && !isNaN(query.minSizeBytes)) {
    conditions.push("f.size >= ?");
    params.push(query.minSizeBytes);
  }
  if (typeof query.maxSizeBytes === "number" && !isNaN(query.maxSizeBytes)) {
    conditions.push("f.size <= ?");
    params.push(query.maxSizeBytes);
  }
  const limit = Math.min(query.limit || 50, 100);
  let sql = "";
  let countSql = "";
  if (rawTerm && mode === "content") {
    const cleaned = rawTerm.replace(/['"*]/g, " ").trim();
    const ftsTokens = cleaned.split(/\s+/).filter(Boolean);
    const ftsQuery = ftsTokens.map((token) => `"${token}"*`).join(" AND ");
    if (!ftsTokens.length) {
      return { results: [], totalCount: 0, queryDurationMs: Date.now() - startTime };
    }
    const whereClause2 = conditions.length ? `AND ${conditions.join(" AND ")}` : "";
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
      WHERE files_fts MATCH ? ${whereClause2}
      ORDER BY rank ASC, f.mtime DESC
      LIMIT ?
    `;
    countSql = `
      SELECT COUNT(*) as total
      FROM files_fts
      JOIN files f ON f.rowid = files_fts.rowid
      WHERE files_fts MATCH ? ${whereClause2}
    `;
    const countParams = [ftsQuery, ...params];
    const selectParams = [ftsQuery, ...params, limit];
    try {
      const countRow2 = db.prepare(countSql).get(...countParams);
      const rows2 = db.prepare(sql).all(...selectParams);
      const results2 = rows2.map((r) => ({
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
        fileUrl: computeFileUrl(r.path)
      }));
      return {
        results: results2,
        totalCount: countRow2?.total ?? 0,
        queryDurationMs: Date.now() - startTime
      };
    } catch {
    }
  }
  if (rawTerm) {
    conditions.push("f.filename LIKE ?");
    params.push(`%${rawTerm}%`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
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
  const countRow = db.prepare(countSql).get(...params);
  const rows = db.prepare(sql).all(...params, limit);
  const results = rows.map((r) => ({
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
    fileUrl: computeFileUrl(r.path)
  }));
  return {
    results,
    totalCount: countRow?.total ?? 0,
    queryDurationMs: Date.now() - startTime
  };
}
function getDocumentStats() {
  const db = initDatabase();
  const totals = db.prepare("SELECT COUNT(*) as totalDocs, COALESCE(SUM(size), 0) as totalBytes FROM files").get();
  const typeRows = db.prepare("SELECT extension, COUNT(*) as count FROM files GROUP BY extension ORDER BY count DESC").all();
  return {
    totalDocuments: totals.totalDocs || 0,
    totalBytes: totals.totalBytes || 0,
    typeCounts: typeRows
  };
}

// electron/preview-service.ts
var import_promises2 = __toESM(require("node:fs/promises"));
var import_mammoth = __toESM(require("mammoth"));
var import_sanitize_html = __toESM(require("sanitize-html"));

// electron/spreadsheet-parser.ts
var import_node_zlib = __toESM(require("node:zlib"));
var SPREADSHEET_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".ods", ".csv", ".tsv"];
function isSpreadsheetExtension(ext) {
  const normalized = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return SPREADSHEET_EXTENSIONS.includes(normalized);
}
function readZipEntries(buffer) {
  const entries = /* @__PURE__ */ new Map();
  let eocdOffset = -1;
  const minEocdOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minEocdOffset; i--) {
    if (buffer.readUInt32LE(i) === 101010256) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    return entries;
  }
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  let ptr = centralDirOffset;
  for (let i = 0; i < totalEntries && ptr + 46 <= buffer.length; i++) {
    const sig = buffer.readUInt32LE(ptr);
    if (sig !== 33639248) break;
    const compressionMethod = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const fileNameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const fileName = buffer.toString("utf8", ptr + 46, ptr + 46 + fileNameLen);
    ptr += 46 + fileNameLen + extraLen + commentLen;
    if (!fileName.endsWith(".xml") || !fileName.startsWith("xl/") && fileName !== "content.xml") {
      continue;
    }
    if (localHeaderOffset + 30 > buffer.length) continue;
    const localSig = buffer.readUInt32LE(localHeaderOffset);
    if (localSig !== 67324752) continue;
    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) continue;
    const rawSlice = buffer.subarray(dataStart, dataEnd);
    try {
      if (compressionMethod === 0) {
        entries.set(fileName, rawSlice.toString("utf8"));
      } else if (compressionMethod === 8) {
        const inflated = import_node_zlib.default.inflateRawSync(rawSlice);
        entries.set(fileName, inflated.toString("utf8"));
      }
    } catch {
    }
  }
  return entries;
}
function decodeXmlEntities(input) {
  return input.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec))).replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
function parseXlsxZip(entries, maxChars) {
  const sharedStrings = [];
  const sharedXml = entries.get("xl/sharedStrings.xml");
  if (sharedXml) {
    const siMatches = sharedXml.match(/<si[\s>][\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
      const text = tMatches.map((t) => decodeXmlEntities(t.replace(/<\/?t(?:\s[^>]*)?>/g, ""))).join("");
      sharedStrings.push(text);
    }
  }
  const sheetNames = [];
  const workbookXml = entries.get("xl/workbook.xml");
  if (workbookXml) {
    const sheetTags = workbookXml.match(/<sheet\s+[^>]*?>/g) || [];
    for (const tag of sheetTags) {
      const nameMatch = tag.match(/\bname="([^"]+)"/);
      if (nameMatch) {
        sheetNames.push(decodeXmlEntities(nameMatch[1]));
      }
    }
  }
  const sheetKeys = Array.from(entries.keys()).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k)).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
  const outputLines = [];
  let charCount = 0;
  sheetKeys.forEach((key, idx) => {
    if (charCount >= maxChars) return;
    const xml = entries.get(key) || "";
    const title = sheetNames[idx] || `Sheet ${idx + 1}`;
    const header = `=== ${title} ===`;
    outputLines.push(header);
    charCount += header.length + 1;
    const rowMatches = xml.match(/<row[\s>][\s\S]*?<\/row>/g) || [];
    for (const rowXml of rowMatches) {
      if (charCount >= maxChars) break;
      const cellMatches = rowXml.match(/<c[\s>][\s\S]*?(?:<\/c>|\/>)/g) || [];
      const rowValues = [];
      for (const cellXml of cellMatches) {
        const typeMatch = cellXml.match(/\bt="([^"]+)"/);
        const cellType = typeMatch ? typeMatch[1] : "";
        if (cellType === "inlineStr") {
          const tMatches = cellXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
          const val = tMatches.map((t) => decodeXmlEntities(t.replace(/<\/?t(?:\s[^>]*)?>/g, ""))).join("");
          if (val) rowValues.push(val);
        } else {
          const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
          if (vMatch) {
            const rawVal = decodeXmlEntities(vMatch[1]);
            if (cellType === "s") {
              const sIdx = Number(rawVal);
              const resolved = sharedStrings[sIdx] ?? rawVal;
              if (resolved) rowValues.push(resolved);
            } else if (rawVal) {
              rowValues.push(rawVal);
            }
          }
        }
      }
      if (rowValues.length > 0) {
        const line = rowValues.join("	");
        outputLines.push(line);
        charCount += line.length + 1;
      }
    }
    outputLines.push("");
  });
  return outputLines.join("\n").trim().slice(0, maxChars);
}
function parseOdsZip(entries, maxChars) {
  const contentXml = entries.get("content.xml");
  if (!contentXml) return "";
  const rows = contentXml.match(/<table:table-row[\s>][\s\S]*?<\/table:table-row>/g) || [];
  const lines = [];
  let totalChars = 0;
  for (const row of rows) {
    if (totalChars >= maxChars) break;
    const pMatches = row.match(/<text:p(?:\s[^>]*)?>([\s\S]*?)<\/text:p>/g) || [];
    const values = pMatches.map((p) => decodeXmlEntities(p.replace(/<[^>]+>/g, "")).trim()).filter(Boolean);
    if (values.length > 0) {
      const line = values.join("	");
      lines.push(line);
      totalChars += line.length + 1;
    }
  }
  return lines.join("\n").slice(0, maxChars);
}
function extractBinarySpreadsheetStrings(buffer, maxChars) {
  const asciiRuns = buffer.toString("latin1").match(/[\x20-\x7E]{4,}/g) || [];
  const filtered = asciiRuns.filter(
    (s) => !/^(Root Entry|Workbook|SummaryInformation|DocumentSummaryInformation|CompObj)$/i.test(s.trim())
  );
  return filtered.join("\n").slice(0, maxChars);
}
function extractSpreadsheetTextFromBuffer(buffer, extension, maxChars = 2e6) {
  const ext = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  if (ext === ".csv" || ext === ".tsv") {
    return buffer.toString("utf8").replace(/\0/g, "").slice(0, maxChars);
  }
  if (ext === ".xlsx" || ext === ".xlsm") {
    const entries = readZipEntries(buffer);
    const parsed = parseXlsxZip(entries, maxChars);
    return parsed || extractBinarySpreadsheetStrings(buffer, maxChars);
  }
  if (ext === ".ods") {
    const entries = readZipEntries(buffer);
    const parsed = parseOdsZip(entries, maxChars);
    return parsed || extractBinarySpreadsheetStrings(buffer, maxChars);
  }
  if (ext === ".xls") {
    return extractBinarySpreadsheetStrings(buffer, maxChars);
  }
  return buffer.toString("utf8").replace(/\0/g, "").slice(0, maxChars);
}

// electron/preview-service.ts
var PREVIEW_MAX_TEXT_BYTES = 2 * 1024 * 1024;
async function generateDocumentPreview(fileId, timeoutMs = 4e3) {
  const file = getFileById(fileId);
  if (!file) {
    throw new Error("Document not found in search index.");
  }
  const config = getConfig();
  const rootPath = config?.rootPath || "";
  const uncPath = computeUncPath(rootPath, file.relativePath);
  const fileUrl = computeFileUrl(file.path);
  const readPromise = async () => {
    await import_promises2.default.access(file.path, import_promises2.default.constants.R_OK);
    const stats = await import_promises2.default.stat(file.path);
    const ext = file.extension.toLowerCase();
    if (ext === ".pdf") {
      const buffer = await import_promises2.default.readFile(file.path);
      const base64 = buffer.toString("base64");
      return {
        id: file.id,
        name: file.name,
        relativePath: file.relativePath,
        kind: "pdf",
        dataUrl: `data:application/pdf;base64,${base64}`,
        mimeType: "application/pdf",
        uncPath,
        fileUrl,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    }
    if (ext === ".docx") {
      const buffer = await import_promises2.default.readFile(file.path);
      const htmlResult = await import_mammoth.default.convertToHtml({ buffer });
      const cleanHtml = (0, import_sanitize_html.default)(htmlResult.value, {
        allowedTags: [
          "a",
          "blockquote",
          "br",
          "em",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "li",
          "ol",
          "p",
          "strong",
          "table",
          "tbody",
          "td",
          "th",
          "thead",
          "tr",
          "u",
          "ul",
          "code",
          "pre",
          "hr",
          "span"
        ],
        allowedAttributes: {
          a: ["href", "title", "target"],
          span: ["class", "style"]
        }
      });
      return {
        id: file.id,
        name: file.name,
        relativePath: file.relativePath,
        kind: "docx",
        content: cleanHtml,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        uncPath,
        fileUrl,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    }
    if (isSpreadsheetExtension(ext)) {
      const buffer = await import_promises2.default.readFile(file.path);
      const content = extractSpreadsheetTextFromBuffer(buffer, ext, 25e4);
      return {
        id: file.id,
        name: file.name,
        relativePath: file.relativePath,
        kind: "text",
        content: content || "(Empty spreadsheet)",
        mimeType: file.mimeType || "text/plain",
        uncPath,
        fileUrl,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    }
    if ([".txt", ".md", ".log", ".json", ".xml", ".yaml", ".yml", ".ts", ".js"].includes(ext)) {
      const buffer = await import_promises2.default.readFile(file.path);
      const content = buffer.toString("utf8", 0, Math.min(buffer.length, PREVIEW_MAX_TEXT_BYTES));
      return {
        id: file.id,
        name: file.name,
        relativePath: file.relativePath,
        kind: "text",
        content: content.replace(/\0/g, ""),
        mimeType: file.mimeType || "text/plain",
        uncPath,
        fileUrl,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    }
    return {
      id: file.id,
      name: file.name,
      relativePath: file.relativePath,
      kind: "unsupported",
      content: "This document format cannot be previewed directly in-app. You can open its native location or copy its network link.",
      mimeType: file.mimeType || "application/octet-stream",
      uncPath,
      fileUrl,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString()
    };
  };
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error("Network drive disconnected or unreachable. Click to retry."));
    }, timeoutMs);
  });
  return Promise.race([readPromise(), timeoutPromise]);
}

// electron/mailer.ts
var import_node_fs2 = require("node:fs");
var import_nodemailer = __toESM(require("nodemailer"));
var MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
async function sendEmailViaSmtp(params) {
  const file = getFileById(params.documentId);
  if (!file) {
    throw new Error("Document not found.");
  }
  const config = getConfig();
  const rootPath = config?.rootPath || "";
  const uncPath = computeUncPath(rootPath, file.relativePath);
  const fileUrl = computeFileUrl(file.path);
  const host = params.smtpConfig?.host || process.env.SMTP_HOST;
  const port = params.smtpConfig?.port || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
  const secure = params.smtpConfig?.secure ?? process.env.SMTP_SECURE === "true";
  const user = params.smtpConfig?.user || process.env.SMTP_USER;
  const pass = params.smtpConfig?.pass || process.env.SMTP_PASS;
  const from = params.smtpConfig?.from || process.env.SMTP_FROM || user;
  if (!host || !user || !pass || !from) {
    throw new Error(
      "SMTP credentials are not configured. Please enter your SMTP details or use your default native mail client."
    );
  }
  const transporter = import_nodemailer.default.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
  const attachments = [];
  if (params.deliveryMode === "attachment") {
    if (!(0, import_node_fs2.existsSync)(file.path)) {
      throw new Error("Document file is no longer accessible on the network drive.");
    }
    const stat = (0, import_node_fs2.statSync)(file.path);
    if (stat.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `File size (${(stat.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 25 MB email attachment limit. Choose "Internal Link" mode instead.`
      );
    }
    attachments.push({
      filename: file.name,
      path: file.path
    });
  }
  const emailBody = `
${params.body ? `${params.body}

` : ""}
---
Document Details:
- Name: ${file.name}
- Network Path (UNC): ${uncPath}
- File URL: ${fileUrl}
- Size: ${(file.sizeBytes / 1024).toFixed(1)} KB
- Last Modified: ${file.modifiedAt}
`.trim();
  await transporter.sendMail({
    from,
    to: params.recipients.join(", "),
    subject: params.subject || `Shared Document: ${file.name}`,
    text: emailBody,
    attachments
  });
  return {
    success: true,
    message: `Document successfully emailed to ${params.recipients.join(", ")}.`
  };
}

// electron/watcher.ts
var import_node_path3 = __toESM(require("node:path"));
var import_promises3 = __toESM(require("node:fs/promises"));
var import_node_fs3 = require("node:fs");
var import_node_crypto = __toESM(require("node:crypto"));
var import_chokidar = __toESM(require("chokidar"));
var import_pdf_parse = require("pdf-parse");
var import_mammoth2 = __toESM(require("mammoth"));
var activeWatcher = null;
function isExcluded(relativePath, fileName, patterns) {
  if (fileName.startsWith(".")) return true;
  if (fileName.startsWith("~$")) return true;
  const parts = relativePath.split(import_node_path3.default.sep);
  if (parts.some((p) => p.startsWith("."))) return true;
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern === fileName || parts.includes(pattern)) return true;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try {
      const regex = new RegExp(`^${escaped}$`, "i");
      if (regex.test(fileName) || regex.test(relativePath.replace(/\\/g, "/"))) return true;
    } catch {
    }
  }
  return false;
}
function getMimeType(extension) {
  const map = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".log": "text/plain",
    ".json": "application/json"
  };
  return map[extension.toLowerCase()] || "application/octet-stream";
}
async function extractText(filePath, ext) {
  const extension = ext.toLowerCase();
  if (extension === ".pdf") {
    const buffer2 = await import_promises3.default.readFile(filePath);
    const parser = new import_pdf_parse.PDFParse({ data: buffer2 });
    try {
      const res = await parser.getText();
      return (res.text || "").slice(0, 2e6);
    } finally {
      await parser.destroy();
    }
  }
  if (extension === ".docx") {
    const buffer2 = await import_promises3.default.readFile(filePath);
    const res = await import_mammoth2.default.extractRawText({ buffer: buffer2 });
    return (res.value || "").slice(0, 2e6);
  }
  if (isSpreadsheetExtension(extension)) {
    const buffer2 = await import_promises3.default.readFile(filePath);
    return extractSpreadsheetTextFromBuffer(buffer2, extension, 2e6);
  }
  const buffer = await import_promises3.default.readFile(filePath);
  return buffer.toString("utf8").replace(/\0/g, "").slice(0, 2e6);
}
async function handleFileUpsert(filePath, rootPath, config) {
  try {
    const relPath = import_node_path3.default.relative(rootPath, filePath);
    const filename = import_node_path3.default.basename(filePath);
    const ext = import_node_path3.default.extname(filePath).toLowerCase();
    if (isExcluded(relPath, filename, config.excludePatterns)) return;
    const allowed = new Set(config.includeExtensions.map((e) => e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`));
    if (!allowed.has(ext)) return;
    const stat = await import_promises3.default.stat(filePath);
    if (!stat.isFile() || stat.size > config.maxFileSizeBytes) return;
    const content = await extractText(filePath, ext);
    upsertFile({
      id: import_node_crypto.default.randomUUID(),
      path: filePath,
      relativePath: relPath,
      filename,
      extension: ext,
      size: stat.size,
      mtime: Math.floor(stat.mtimeMs),
      mimeType: getMimeType(ext),
      content
    });
  } catch {
  }
}
function stopWatcher() {
  if (activeWatcher) {
    activeWatcher.close().catch(() => {
    });
    activeWatcher = null;
  }
}
function startWatcher(config) {
  stopWatcher();
  if (!config.backgroundSync) {
    return;
  }
  const root = import_node_path3.default.resolve(config.rootPath);
  if (!(0, import_node_fs3.existsSync)(root)) return;
  const watcher = import_chokidar.default.watch(root, {
    ignored: /(^|[/\\])\../,
    // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    // initial crawl handles existing files
    awaitWriteFinish: {
      stabilityThreshold: 1e3,
      pollInterval: 200
    },
    depth: 99
  });
  watcher.on("add", (filePath) => {
    void handleFileUpsert(filePath, root, config);
  }).on("change", (filePath) => {
    void handleFileUpsert(filePath, root, config);
  }).on("unlink", (filePath) => {
    deleteFileByPath(filePath);
  }).on("error", () => {
  });
  activeWatcher = watcher;
}

// electron/main.ts
var mainWindow = null;
var indexerWorker = null;
var scheduledTimer = null;
var currentStatus = {
  running: false,
  phase: "idle",
  discovered: 0,
  processed: 0,
  indexed: 0,
  skipped: 0,
  velocity: 0,
  currentDirectory: "",
  currentFile: null,
  startedAt: null,
  finishedAt: null,
  logs: []
};
function createWindow() {
  const isDev = process.env.NODE_ENV === "development" || !import_electron2.app.isPackaged;
  mainWindow = new import_electron2.BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 960,
    minHeight: 620,
    title: "Folio \u2014 Network Drive Search & Discovery",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#002654",
    webPreferences: {
      preload: import_node_path4.default.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  import_electron2.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' 'unsafe-inline' data: blob: http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline' http://localhost:*; font-src 'self' data: http://localhost:*; img-src 'self' data: blob: http://localhost:*; frame-src 'self' data: blob: http://localhost:*;"
        ]
      }
    });
  });
  const distIndex = import_node_path4.default.join(__dirname, "../artifacts/document-discovery/dist/public/index.html");
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch(() => {
      if ((0, import_node_fs4.existsSync)(distIndex)) {
        mainWindow?.loadFile(distIndex);
      }
    });
  } else if ((0, import_node_fs4.existsSync)(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL("http://localhost:5173");
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}
function startIndexWorker() {
  if (indexerWorker || currentStatus.running) {
    return { success: false, message: "An indexing run is already in progress." };
  }
  const config = getConfig();
  if (!config) {
    return { success: false, message: "Please configure your network target directory first." };
  }
  currentStatus = {
    running: true,
    phase: "scanning",
    discovered: 0,
    processed: 0,
    indexed: 0,
    skipped: 0,
    velocity: 0,
    currentDirectory: config.rootPath,
    currentFile: null,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    finishedAt: null,
    logs: []
  };
  const workerPath = import_node_path4.default.join(__dirname, "indexer-worker.js");
  const dbPath = getDatabasePath();
  try {
    indexerWorker = new import_node_worker_threads.Worker(workerPath);
    indexerWorker.on("message", (msg) => {
      if (msg.type === "PROGRESS") {
        currentStatus = msg.status;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("indexer:progress", currentStatus);
        }
      } else if (msg.type === "ERROR") {
        currentStatus.running = false;
        currentStatus.phase = "error";
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("indexer:progress", currentStatus);
        }
      }
    });
    indexerWorker.on("error", (err) => {
      currentStatus.running = false;
      currentStatus.phase = "error";
      indexerWorker = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("indexer:progress", currentStatus);
      }
    });
    indexerWorker.on("exit", () => {
      currentStatus.running = false;
      indexerWorker = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("indexer:progress", currentStatus);
      }
      const currentConfig = getConfig();
      if (currentConfig?.backgroundSync) {
        startWatcher(currentConfig);
      }
    });
    indexerWorker.postMessage({
      type: "START",
      config,
      dbPath
    });
    return { success: true, message: "Indexing started." };
  } catch (err) {
    currentStatus.running = false;
    currentStatus.phase = "error";
    const msg = err instanceof Error ? err.message : "Failed to launch indexer";
    return { success: false, message: msg };
  }
}
function stopIndexWorker() {
  if (indexerWorker) {
    indexerWorker.postMessage({ type: "STOP" });
  }
  currentStatus.running = false;
  currentStatus.phase = "idle";
}
function syncSchedule(config) {
  if (scheduledTimer) {
    clearInterval(scheduledTimer);
    scheduledTimer = null;
  }
  if (config.indexingFrequency === "manual") return;
  const interval = config.indexingFrequency === "hourly" ? 60 * 60 * 1e3 : 24 * 60 * 60 * 1e3;
  scheduledTimer = setInterval(() => {
    void startIndexWorker();
  }, interval);
  scheduledTimer.unref();
}
function registerIpcHandlers() {
  import_electron2.ipcMain.handle("dialog:selectDirectory", async () => {
    if (!mainWindow) return null;
    const result = await import_electron2.dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select Mapped Network Drive or Directory"
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  import_electron2.ipcMain.handle("indexer:testTarget", async (_event, targetPath) => {
    return testTargetAccess(targetPath);
  });
  import_electron2.ipcMain.handle("indexer:getConfig", async () => {
    return getConfig();
  });
  import_electron2.ipcMain.handle("indexer:saveConfig", async (_event, config) => {
    const saved = saveConfig(config);
    if (saved.backgroundSync) {
      startWatcher(saved);
    } else {
      stopWatcher();
    }
    syncSchedule(saved);
    return saved;
  });
  import_electron2.ipcMain.handle("indexer:startIndex", async () => {
    return startIndexWorker();
  });
  import_electron2.ipcMain.handle("indexer:stopIndex", async () => {
    stopIndexWorker();
  });
  import_electron2.ipcMain.handle("indexer:getStatus", async () => {
    return currentStatus;
  });
  import_electron2.ipcMain.handle("search:query", async (_event, query) => {
    return searchDocuments(query);
  });
  import_electron2.ipcMain.handle("search:getStats", async () => {
    return getDocumentStats();
  });
  import_electron2.ipcMain.handle("documents:get", async (_event, id) => {
    return getFileById(id);
  });
  import_electron2.ipcMain.handle("documents:preview", async (_event, id) => {
    return generateDocumentPreview(id);
  });
  import_electron2.ipcMain.handle("documents:getShareLinks", async (_event, id) => {
    const file = getFileById(id);
    if (!file) throw new Error("Document not found");
    const config = getConfig();
    const rootPath = config?.rootPath || "";
    const uncPath = computeUncPath(rootPath, file.relativePath);
    const fileUrl = computeFileUrl(file.path);
    const markdownLink = computeMarkdownLink(file.name, uncPath);
    return { uncPath, fileUrl, markdownLink };
  });
  import_electron2.ipcMain.handle("shell:showItemInFolder", async (_event, targetPath) => {
    if ((0, import_node_fs4.existsSync)(targetPath)) {
      import_electron2.shell.showItemInFolder(targetPath);
    } else {
      throw new Error("File does not exist on disk.");
    }
  });
  import_electron2.ipcMain.handle("shell:openExternal", async (_event, url) => {
    await import_electron2.shell.openExternal(url);
  });
  import_electron2.ipcMain.handle("clipboard:writeText", async (_event, text) => {
    import_electron2.clipboard.writeText(text);
  });
  import_electron2.ipcMain.handle("email:sendSmtp", async (_event, params) => {
    return sendEmailViaSmtp(params);
  });
}
import_electron2.app.whenReady().then(() => {
  initDatabase();
  registerIpcHandlers();
  createWindow();
  const config = getConfig();
  if (config) {
    if (config.backgroundSync) {
      startWatcher(config);
    }
    syncSchedule(config);
  }
  import_electron2.app.on("activate", () => {
    if (import_electron2.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron2.app.on("window-all-closed", () => {
  stopWatcher();
  if (process.platform !== "darwin") {
    import_electron2.app.quit();
  }
});
//# sourceMappingURL=main.js.map
