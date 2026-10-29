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

// electron/indexer-worker.ts
var import_node_worker_threads = require("node:worker_threads");
var import_promises = __toESM(require("node:fs/promises"));
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
var import_node_crypto = __toESM(require("node:crypto"));
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_pdf_parse = require("pdf-parse");
var import_mammoth = __toESM(require("mammoth"));

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

// electron/indexer-worker.ts
var shouldStop = false;
var db = null;
var MAX_INDEXED_TEXT_CHARS = 2e6;
var BATCH_SIZE = 25;
function isExcluded(relativePath, fileName, excludePatterns) {
  if (fileName.startsWith(".")) return true;
  if (fileName.startsWith("~$")) return true;
  const parts = relativePath.split(import_node_path.default.sep);
  if (parts.some((p) => p.startsWith("."))) return true;
  for (const raw of excludePatterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern === fileName || parts.includes(pattern)) return true;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    try {
      const regex = new RegExp(`^${escaped}$`, "i");
      if (regex.test(fileName) || regex.test(relativePath.replace(/\\/g, "/"))) {
        return true;
      }
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
async function extractFileText(filePath, extension) {
  const ext = extension.toLowerCase();
  if (ext === ".pdf") {
    const buffer2 = await import_promises.default.readFile(filePath);
    const parser = new import_pdf_parse.PDFParse({ data: buffer2 });
    try {
      const result = await parser.getText();
      return (result.text || "").slice(0, MAX_INDEXED_TEXT_CHARS);
    } finally {
      await parser.destroy();
    }
  }
  if (ext === ".docx") {
    const buffer2 = await import_promises.default.readFile(filePath);
    const result = await import_mammoth.default.extractRawText({ buffer: buffer2 });
    return (result.value || "").slice(0, MAX_INDEXED_TEXT_CHARS);
  }
  if (isSpreadsheetExtension(ext)) {
    const buffer2 = await import_promises.default.readFile(filePath);
    return extractSpreadsheetTextFromBuffer(buffer2, ext, MAX_INDEXED_TEXT_CHARS);
  }
  const buffer = await import_promises.default.readFile(filePath);
  return buffer.toString("utf8").replace(/\0/g, "").slice(0, MAX_INDEXED_TEXT_CHARS);
}
async function runCrawlAndIndex(config, dbPath) {
  shouldStop = false;
  db = new import_better_sqlite3.default(dbPath);
  db.pragma("journal_mode = WAL");
  const root = import_node_path.default.resolve(config.rootPath);
  if (!(0, import_node_fs.existsSync)(root)) {
    throw new Error(`Configured root directory does not exist: ${config.rootPath}`);
  }
  const logs = [];
  const addLog = (level, targetPath, reason) => {
    const entry = {
      id: import_node_crypto.default.randomUUID(),
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString(),
      level,
      path: targetPath,
      reason
    };
    logs.unshift(entry);
    if (logs.length > 100) logs.pop();
  };
  const status = {
    running: true,
    phase: "scanning",
    discovered: 0,
    processed: 0,
    indexed: 0,
    skipped: 0,
    velocity: 0,
    currentDirectory: root,
    currentFile: null,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    finishedAt: null,
    logs
  };
  const allowedExts = new Set(
    config.includeExtensions.map((e) => e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`)
  );
  const velocityWindow = [];
  let lastProgressReportTime = 0;
  const reportProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressReportTime < 120) return;
    lastProgressReportTime = now;
    while (velocityWindow.length && velocityWindow[0] < now - 3e3) {
      velocityWindow.shift();
    }
    const currentVelocity = velocityWindow.length ? Math.round(velocityWindow.length / 3 * 10) / 10 : 0;
    status.velocity = currentVelocity;
    status.logs = logs.slice(0, 50);
    if (import_node_worker_threads.parentPort) {
      import_node_worker_threads.parentPort.postMessage({ type: "PROGRESS", status });
    }
  };
  reportProgress(true);
  const discoveredFiles = [];
  async function walk(dir) {
    if (shouldStop) return;
    status.currentDirectory = dir;
    reportProgress();
    let entries;
    try {
      entries = await import_promises.default.readdir(dir, { withFileTypes: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cannot read directory";
      addLog("error", import_node_path.default.relative(root, dir) || ".", `Directory read permission error: ${msg}`);
      return;
    }
    for (const entry of entries) {
      if (shouldStop) return;
      const fullPath = import_node_path.default.join(dir, entry.name);
      const relPath = import_node_path.default.relative(root, fullPath);
      if (isExcluded(relPath, entry.name, config.excludePatterns)) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = import_node_path.default.extname(entry.name).toLowerCase();
      if (!allowedExts.has(ext)) {
        continue;
      }
      try {
        const stats = await import_promises.default.stat(fullPath);
        if (stats.size > config.maxFileSizeBytes) {
          status.skipped++;
          status.processed++;
          addLog("warn", relPath, `Skipped: Exceeds size limit (${Math.round(stats.size / (1024 * 1024))} MB > ${Math.round(config.maxFileSizeBytes / (1024 * 1024))} MB)`);
          continue;
        }
        discoveredFiles.push({
          absolutePath: fullPath,
          relativePath: relPath,
          filename: entry.name,
          extension: ext,
          size: stats.size,
          mtime: stats.mtimeMs
        });
        status.discovered = discoveredFiles.length + status.skipped;
        reportProgress();
      } catch (statErr) {
        status.skipped++;
        status.processed++;
        const msg = statErr instanceof Error ? statErr.message : "Cannot read metadata";
        addLog("warn", relPath, `Skipped: ${msg}`);
      }
    }
  }
  addLog("info", root, "Starting directory discovery crawl...");
  await walk(root);
  if (shouldStop) {
    status.running = false;
    status.phase = "idle";
    status.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    reportProgress(true);
    return;
  }
  status.phase = "indexing";
  addLog("info", ".", `Discovered ${discoveredFiles.length} candidate documents to index.`);
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
  const batchUpsertTx = db.transaction((items) => {
    for (const item of items) {
      upsertStmt.run(item);
    }
  });
  let currentBatch = [];
  const seenPaths = /* @__PURE__ */ new Set();
  for (const file of discoveredFiles) {
    if (shouldStop) break;
    status.currentFile = file.relativePath;
    seenPaths.add(file.absolutePath);
    try {
      const content = await extractFileText(file.absolutePath, file.extension);
      const mimeType = getMimeType(file.extension);
      currentBatch.push({
        id: import_node_crypto.default.randomUUID(),
        path: file.absolutePath,
        relative_path: file.relativePath,
        filename: file.filename,
        extension: file.extension,
        size: file.size,
        mtime: Math.floor(file.mtime),
        mime_type: mimeType,
        content,
        indexed_at: Date.now()
      });
      status.indexed++;
      velocityWindow.push(Date.now());
    } catch (parseErr) {
      status.skipped++;
      const msg = parseErr instanceof Error ? parseErr.message : "Text extraction failed";
      addLog("warn", file.relativePath, `Text extraction error: ${msg}`);
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
  if (!shouldStop) {
    const existingRows = db.prepare("SELECT path FROM files").all();
    const toDelete = existingRows.filter((r) => !seenPaths.has(r.path));
    if (toDelete.length > 0) {
      const delStmt = db.prepare("DELETE FROM files WHERE path = ?");
      const delTx = db.transaction((rows) => {
        for (const row of rows) {
          delStmt.run(row.path);
        }
      });
      delTx(toDelete);
      addLog("info", ".", `Pruned ${toDelete.length} removed files from search index.`);
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare("UPDATE config SET indexed_count = ?, last_indexed_at = ? WHERE id = 1").run(
      status.indexed,
      nowIso
    );
  }
  status.running = false;
  status.phase = shouldStop ? "idle" : "complete";
  status.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  status.currentFile = null;
  addLog("info", ".", `Indexing complete. ${status.indexed} files successfully indexed, ${status.skipped} skipped.`);
  reportProgress(true);
  db.close();
  db = null;
}
if (import_node_worker_threads.parentPort) {
  import_node_worker_threads.parentPort.on("message", async (msg) => {
    if (msg.type === "START") {
      try {
        await runCrawlAndIndex(msg.config, msg.dbPath);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown crawl failure";
        if (import_node_worker_threads.parentPort) {
          import_node_worker_threads.parentPort.postMessage({
            type: "ERROR",
            error: errorMsg
          });
        }
      } finally {
        if (db) {
          try {
            db.close();
          } catch {
          }
          db = null;
        }
        import_node_worker_threads.parentPort?.close();
      }
    } else if (msg.type === "STOP") {
      shouldStop = true;
    }
  });
}
//# sourceMappingURL=indexer-worker.js.map
