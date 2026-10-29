import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import type { DocumentPreview } from './types';
import { getFileById, getConfig } from './database';
import { computeFileUrl, computeUncPath } from './network-utils';
import { extractSpreadsheetTextFromBuffer, isSpreadsheetExtension } from './spreadsheet-parser';

const PREVIEW_MAX_TEXT_BYTES = 2 * 1024 * 1024; // 2 MB preview limit

export async function generateDocumentPreview(fileId: string, timeoutMs = 4000): Promise<DocumentPreview> {
  const file = getFileById(fileId);
  if (!file) {
    throw new Error('Document not found in search index.');
  }

  const config = getConfig();
  const rootPath = config?.rootPath || '';
  const uncPath = computeUncPath(rootPath, file.relativePath);
  const fileUrl = computeFileUrl(file.path);

  // Wrap file read in timeout guard
  const readPromise = async (): Promise<DocumentPreview> => {
    // Check if file is accessible
    await fs.access(file.path, fs.constants.R_OK);
    const stats = await fs.stat(file.path);
    const ext = file.extension.toLowerCase();

    // 1. PDF Preview
    if (ext === '.pdf') {
      const buffer = await fs.readFile(file.path);
      const base64 = buffer.toString('base64');
      return {
        id: file.id,
        name: file.name,
        relativePath: file.relativePath,
        kind: 'pdf',
        dataUrl: `data:application/pdf;base64,${base64}`,
        mimeType: 'application/pdf',
        uncPath,
        fileUrl,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    }

    // 2. Word (.docx) Preview
    if (ext === '.docx') {
      const buffer = await fs.readFile(file.path);
      const htmlResult = await mammoth.convertToHtml({ buffer });
      const cleanHtml = sanitizeHtml(htmlResult.value, {
        allowedTags: [
          'a', 'blockquote', 'br', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'li', 'ol', 'p', 'strong', 'table', 'tbody', 'td', 'th',
          'thead', 'tr', 'u', 'ul', 'code', 'pre', 'hr', 'span',
        ],
        allowedAttributes: {
          a: ['href', 'title', 'target'],
          span: ['class', 'style'],
        },
      });

      return {
        id: file.id,
        name: file.name,
        relativePath: file.relativePath,
        kind: 'docx',
        content: cleanHtml,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        uncPath,
        fileUrl,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    }

    // 3. Spreadsheets (.xlsx, .xls, .xlsm, .ods, .csv, .tsv)
    if (isSpreadsheetExtension(ext)) {
      const buffer = await fs.readFile(file.path);
      const content = extractSpreadsheetTextFromBuffer(buffer, ext, 250_000);
      return {
        id: file.id,
        name: file.name,
        relativePath: file.relativePath,
        kind: 'text',
        content: content || '(Empty spreadsheet)',
        mimeType: file.mimeType || 'text/plain',
        uncPath,
        fileUrl,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    }

    // 4. Plaintext, Markdown, Logs, JSON
    if (['.txt', '.md', '.log', '.json', '.xml', '.yaml', '.yml', '.ts', '.js'].includes(ext)) {
      const buffer = await fs.readFile(file.path);
      const content = buffer.toString('utf8', 0, Math.min(buffer.length, PREVIEW_MAX_TEXT_BYTES));
      return {
        id: file.id,
        name: file.name,
        relativePath: file.relativePath,
        kind: 'text',
        content: content.replace(/\0/g, ''),
        mimeType: file.mimeType || 'text/plain',
        uncPath,
        fileUrl,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    }

    return {
      id: file.id,
      name: file.name,
      relativePath: file.relativePath,
      kind: 'unsupported',
      content: 'This document format cannot be previewed directly in-app. You can open its native location or copy its network link.',
      mimeType: file.mimeType || 'application/octet-stream',
      uncPath,
      fileUrl,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  };

  const timeoutPromise = new Promise<DocumentPreview>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Network drive disconnected or unreachable. Click to retry.'));
    }, timeoutMs);
  });

  return Promise.race([readPromise(), timeoutPromise]);
}
