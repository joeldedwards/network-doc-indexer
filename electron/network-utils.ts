import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { TestTargetResult } from './types';

/**
 * Checks if a string looks like a standard Windows UNC path (e.g. \\Server\Share or //Server/Share).
 */
export function isUncPath(targetPath: string): boolean {
  if (!targetPath) return false;
  const trimmed = targetPath.trim();
  return /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(trimmed);
}

/**
 * Normalizes a UNC or local path for cross-platform representation.
 */
export function normalizePath(targetPath: string): string {
  if (!targetPath) return '';
  const trimmed = targetPath.trim();
  if (isUncPath(trimmed)) {
    // Windows UNC standard uses backslashes
    return trimmed.replace(/\//g, '\\');
  }
  return path.resolve(trimmed);
}

/**
 * Computes the normalized UNC path or cross-platform display path for a file.
 */
export function computeUncPath(rootPath: string, relativePath: string): string {
  const normRoot = rootPath.trim();
  const normRel = relativePath.replace(/^[\\/]+/, '');
  
  if (isUncPath(normRoot)) {
    const cleanRoot = normRoot.replace(/\//g, '\\').replace(/\\+$/, '');
    const cleanRel = normRel.replace(/\//g, '\\');
    return `${cleanRoot}\\${cleanRel}`;
  }
  
  // If root is a mapped drive like Z:\
  if (/^[A-Za-z]:[\\/]/.test(normRoot)) {
    const cleanRoot = normRoot.replace(/\//g, '\\').replace(/\\+$/, '');
    const cleanRel = normRel.replace(/\//g, '\\');
    return `${cleanRoot}\\${cleanRel}`;
  }

  // Otherwise return absolute normalized system path
  return path.resolve(normRoot, normRel);
}

/**
 * Returns a file:// URL for a file path.
 */
export function computeFileUrl(absolutePath: string): string {
  try {
    return pathToFileURL(absolutePath).href;
  } catch {
    return `file://${absolutePath.replace(/\\/g, '/')}`;
  }
}

/**
 * Computes a clean Markdown link: [Document Name](\\server\share\file.pdf)
 */
export function computeMarkdownLink(docName: string, uncOrFullPath: string): string {
  return `[${docName}](${uncOrFullPath})`;
}

/**
 * Asynchronously checks if a target directory is accessible and readable,
 * protected with a strict timeout guard to prevent UI freezes on dropped network shares.
 */
export async function testTargetAccess(targetPath: string, timeoutMs = 3500): Promise<TestTargetResult> {
  const trimmed = (targetPath || '').trim();
  if (!trimmed) {
    return {
      accessible: false,
      path: '',
      isUnc: false,
      normalizedPath: '',
      latencyMs: 0,
      fileCount: 0,
      error: 'Please enter or select a directory path.',
    };
  }

  const isUnc = isUncPath(trimmed);
  const normalizedPath = isUnc ? trimmed.replace(/\//g, '\\') : path.resolve(trimmed);
  const startTime = Date.now();

  try {
    const accessPromise = async (): Promise<{ fileCount: number }> => {
      // Test read permissions
      await fs.access(normalizedPath, fs.constants.R_OK);
      const stats = await fs.stat(normalizedPath);
      if (!stats.isDirectory()) {
        throw new Error('Target is not a directory.');
      }

      // Read entries to measure latency and test connectivity
      const entries = await fs.readdir(normalizedPath, { withFileTypes: true });
      let fileCount = 0;
      for (const entry of entries) {
        if (!entry.name.startsWith('.')) {
          fileCount++;
        }
      }
      return { fileCount };
    };

    const timeoutPromise = new Promise<{ fileCount: number }>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Network drive timed out or unreachable. Connection took longer than 3.5 seconds.'));
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
      fileCount: result.fileCount,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : 'Directory could not be reached.';
    return {
      accessible: false,
      path: trimmed,
      isUnc,
      normalizedPath,
      latencyMs,
      fileCount: 0,
      error: `Network drive disconnected or unreachable: ${message}`,
    };
  }
}
