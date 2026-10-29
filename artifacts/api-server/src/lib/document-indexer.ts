import { readdir, readFile, lstat, realpath, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import { db, documentIndexerConfigTable, indexedDocumentsTable } from "@workspace/db";
import { eq, notInArray } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { logger } from "./logger";

const MAX_DISCOVERED_FILES = 10000;
const MAX_INDEXED_TEXT_CHARS = 2_000_000;
const SAMPLE_DATA_PATH = path.resolve(process.cwd(), "sample-data");

export type IndexerSettings = {
  rootPath: string;
  includeExtensions: string[];
  excludePatterns: string[];
  maxFileSizeBytes: number;
  indexingFrequency: "manual" | "hourly" | "daily";
};

export type IndexStatus = {
  running: boolean;
  phase: "idle" | "scanning" | "complete" | "error";
  discovered: number;
  processed: number;
  indexed: number;
  skipped: number;
  errors: string[];
  currentFile: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type ResolvedFile = {
  absolutePath: string;
  relativePath: string;
  info: Stats;
};

const idleStatus = (): IndexStatus => ({
  running: false,
  phase: "idle",
  discovered: 0,
  processed: 0,
  indexed: 0,
  skipped: 0,
  errors: [],
  currentFile: null,
  startedAt: null,
  finishedAt: null,
});

let indexStatus = idleStatus();
let scheduleTimer: NodeJS.Timeout | undefined;

function pathIsInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function getAllowedRoot(): Promise<string> {
  const configured = process.env.DOCUMENTS_ALLOWED_ROOT || SAMPLE_DATA_PATH;
  return realpath(path.resolve(process.cwd(), configured));
}

export async function resolveDocumentRoot(rootPath: string): Promise<string> {
  const allowedRoot = await getAllowedRoot();
  const candidate = await realpath(path.resolve(process.cwd(), rootPath));
  const details = await stat(candidate);

  if (!details.isDirectory()) {
    throw new Error("The selected target is not a directory.");
  }
  if (!pathIsInside(allowedRoot, candidate)) {
    throw new Error(
      "The target must be inside the configured document storage area. A mounted share can be enabled by setting DOCUMENTS_ALLOWED_ROOT to its mount path.",
    );
  }

  return candidate;
}

function isExcluded(
  relativePath: string,
  name: string,
  patterns: string[],
): boolean {
  if (name.startsWith(".")) return true;

  const pathParts = relativePath.split(path.sep);
  if (pathParts.some((part) => part.startsWith("."))) return true;

  return patterns.some((rawPattern) => {
    const pattern = rawPattern.trim();
    if (!pattern) return false;
    if (pattern === name || pathParts.includes(pattern)) return true;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    const matcher = new RegExp(`^${escaped}$`, "i");
    return matcher.test(name) || matcher.test(relativePath.split(path.sep).join("/"));
  });
}

async function collectCandidateFiles(
  root: string,
  includeExtensions: string[],
  excludePatterns: string[],
  maxFileSizeBytes: number,
): Promise<ResolvedFile[]> {
  const files: ResolvedFile[] = [];
  const allowedExtensions = new Set(includeExtensions.map((extension) => extension.toLowerCase()));

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (isExcluded(relativePath, entry.name, excludePatterns)) continue;

      // Symlinks are deliberately not followed so an index stays within its selected root.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!allowedExtensions.has(extension)) continue;

      try {
        const details = await lstat(absolutePath);
        if (!details.isFile() || details.isSymbolicLink()) continue;
        if (details.size > maxFileSizeBytes) {
          indexStatus.skipped += 1;
          addIndexError(relativePath, "Skipped because the file exceeds the configured size limit.");
          continue;
        }
        files.push({ absolutePath, relativePath, info: details });
        if (files.length >= MAX_DISCOVERED_FILES) {
          addIndexError("", `The crawl stopped at the ${MAX_DISCOVERED_FILES.toLocaleString()} file safety limit.`);
          return;
        }
      } catch (error) {
        addIndexError(relativePath, "Could not read file metadata.");
      }
    }
  }

  await walk(root);
  return files;
}

function addIndexError(relativePath: string, message: string): void {
  if (indexStatus.errors.length >= 8) return;
  indexStatus.errors.push(relativePath ? `${relativePath}: ${message}` : message);
}

function contentTypeFor(extension: string): string {
  const types: Record<string, string> = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".log": "text/plain",
    ".json": "application/json",
  };
  return types[extension] || "application/octet-stream";
}

async function extractText(filePath: string, extension: string): Promise<string> {
  const buffer = await readFile(filePath);
  if (extension === ".pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.slice(0, MAX_INDEXED_TEXT_CHARS);
    } finally {
      await parser.destroy();
    }
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.slice(0, MAX_INDEXED_TEXT_CHARS);
  }

  return buffer
    .toString("utf8")
    .replaceAll("\u0000", "")
    .slice(0, MAX_INDEXED_TEXT_CHARS);
}

export async function getIndexerConfig() {
  const [config] = await db
    .select()
    .from(documentIndexerConfigTable)
    .where(eq(documentIndexerConfigTable.id, 1))
    .limit(1);
  return config ?? null;
}

export function getIndexStatus(): IndexStatus {
  return { ...indexStatus, errors: [...indexStatus.errors] };
}

export async function testDirectoryTarget(
  rootPath: string,
): Promise<{ accessible: boolean; fileCount: number; message: string }> {
  try {
    const root = await resolveDocumentRoot(rootPath);
    let fileCount = 0;

    async function count(directory: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isSymbolicLink()) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await count(absolutePath);
        } else if (entry.isFile()) {
          fileCount += 1;
          if (fileCount >= MAX_DISCOVERED_FILES) return;
        }
      }
    }

    await count(root);
    return {
      accessible: true,
      fileCount,
      message: fileCount
        ? `Directory is readable. ${fileCount.toLocaleString()} file${fileCount === 1 ? "" : "s"} found.`
        : "Directory is readable, but it contains no files yet.",
    };
  } catch (error) {
    return {
      accessible: false,
      fileCount: 0,
      message: error instanceof Error ? error.message : "Directory is not readable.",
    };
  }
}

export async function resolveIndexedFile(relativePath: string): Promise<ResolvedFile> {
  const config = await getIndexerConfig();
  if (!config) throw new Error("Document storage has not been configured.");
  const root = await resolveDocumentRoot(config.rootPath);
  const normalizedRelative = path.normalize(relativePath);
  if (path.isAbsolute(normalizedRelative) || normalizedRelative.startsWith("..")) {
    throw new Error("Invalid document path.");
  }

  const absolutePath = path.resolve(root, normalizedRelative);
  if (!pathIsInside(root, absolutePath)) throw new Error("Invalid document path.");

  const details = await lstat(absolutePath);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error("Document is no longer available.");
  }
  const actualPath = await realpath(absolutePath);
  if (!pathIsInside(root, actualPath)) {
    throw new Error("Document path is outside the configured storage area.");
  }

  return { absolutePath: actualPath, relativePath: normalizedRelative, info: details };
}

export async function startDocumentIndex(): Promise<{
  accepted: boolean;
  message: string;
  status: IndexStatus;
}> {
  if (indexStatus.running) {
    return {
      accepted: false,
      message: "An index run is already in progress.",
      status: getIndexStatus(),
    };
  }

  const config = await getIndexerConfig();
  if (!config) {
    return {
      accepted: false,
      message: "Complete directory setup before starting the index.",
      status: getIndexStatus(),
    };
  }

  indexStatus = {
    ...idleStatus(),
    running: true,
    phase: "scanning",
    startedAt: new Date(),
  };
  void runIndex(config);

  return {
    accepted: true,
    message: "Indexing started.",
    status: getIndexStatus(),
  };
}

async function runIndex(
  config: typeof documentIndexerConfigTable.$inferSelect,
): Promise<void> {
  try {
    const root = await resolveDocumentRoot(config.rootPath);
    const files = await collectCandidateFiles(
      root,
      config.includeExtensions,
      config.excludePatterns,
      config.maxFileSizeBytes,
    );
    indexStatus.discovered = files.length + indexStatus.skipped;
    indexStatus.processed = indexStatus.skipped;
    indexStatus.phase = "scanning";

    const seenPaths: string[] = [];
    for (const file of files) {
      indexStatus.currentFile = file.relativePath.split(path.sep).join("/");
      const extension = path.extname(file.absolutePath).toLowerCase();
      const relativePath = file.relativePath.split(path.sep).join("/");
      seenPaths.push(relativePath);
      try {
        // Re-check the file immediately before reading to avoid following a replaced symlink.
        const checked = await resolveIndexedFile(file.relativePath);
        const content = await extractText(checked.absolutePath, extension);

        await db
          .insert(indexedDocumentsTable)
          .values({
            relativePath,
            name: path.basename(file.absolutePath),
            extension,
            sizeBytes: checked.info.size,
            modifiedAt: checked.info.mtime,
            mimeType: contentTypeFor(extension),
            content,
            indexedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: indexedDocumentsTable.relativePath,
            set: {
              name: path.basename(file.absolutePath),
              extension,
              sizeBytes: checked.info.size,
              modifiedAt: checked.info.mtime,
              mimeType: contentTypeFor(extension),
              content,
              indexedAt: new Date(),
            },
          });
        indexStatus.indexed += 1;
      } catch (error) {
        indexStatus.skipped += 1;
        addIndexError(
          file.relativePath.split(path.sep).join("/"),
          error instanceof Error ? "Could not extract text from this file." : "File could not be indexed.",
        );
      } finally {
        indexStatus.processed += 1;
      }
    }

    if (seenPaths.length) {
      await db
        .delete(indexedDocumentsTable)
        .where(notInArray(indexedDocumentsTable.relativePath, seenPaths));
    } else if (files.length === 0 && indexStatus.skipped === 0) {
      await db.delete(indexedDocumentsTable);
    }

    await db
      .update(documentIndexerConfigTable)
      .set({
        lastIndexedAt: new Date(),
        indexedCount: indexStatus.indexed,
      })
      .where(eq(documentIndexerConfigTable.id, 1));

    indexStatus.phase = "complete";
  } catch (error) {
    indexStatus.phase = "error";
    addIndexError("", error instanceof Error ? error.message : "The index run failed.");
    logger.error({ err: error }, "Document indexing failed");
  } finally {
    indexStatus.running = false;
    indexStatus.currentFile = null;
    indexStatus.finishedAt = new Date();
  }
}

export function syncIndexSchedule(
  frequency: "manual" | "hourly" | "daily",
): void {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = undefined;
  if (frequency === "manual") return;

  const interval = frequency === "hourly" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  scheduleTimer = setInterval(() => {
    void startDocumentIndex();
  }, interval);
  scheduleTimer.unref();
}

export async function restoreIndexSchedule(): Promise<void> {
  try {
    const config = await getIndexerConfig();
    if (config) syncIndexSchedule(config.indexingFrequency as IndexerSettings["indexingFrequency"]);
  } catch (error) {
    logger.error({ err: error }, "Could not restore document index schedule");
  }
}
