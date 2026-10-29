import zlib from 'node:zlib';

export const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.xlsm', '.ods', '.csv', '.tsv'] as const;

export function isSpreadsheetExtension(ext: string): boolean {
  const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return (SPREADSHEET_EXTENSIONS as readonly string[]).includes(normalized);
}

/**
 * Minimal in-memory ZIP archive reader using Node's built-in `zlib.inflateRawSync`
 * to extract XML entries from .xlsx, .xlsm, and .ods files without external dependencies.
 */
function readZipEntries(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();

  // Locate End of Central Directory (EOCD) signature: 0x06054b50
  let eocdOffset = -1;
  const minEocdOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minEocdOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
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
    if (sig !== 0x02014b50) break;

    const compressionMethod = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const fileNameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);

    const fileName = buffer.toString('utf8', ptr + 46, ptr + 46 + fileNameLen);
    ptr += 46 + fileNameLen + extraLen + commentLen;

    // Only decode XML files needed for spreadsheet text extraction
    if (
      !fileName.endsWith('.xml') ||
      (!fileName.startsWith('xl/') && fileName !== 'content.xml')
    ) {
      continue;
    }

    if (localHeaderOffset + 30 > buffer.length) continue;
    const localSig = buffer.readUInt32LE(localHeaderOffset);
    if (localSig !== 0x04034b50) continue;

    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) continue;

    const rawSlice = buffer.subarray(dataStart, dataEnd);
    try {
      if (compressionMethod === 0) {
        entries.set(fileName, rawSlice.toString('utf8'));
      } else if (compressionMethod === 8) {
        const inflated = zlib.inflateRawSync(rawSlice);
        entries.set(fileName, inflated.toString('utf8'));
      }
    } catch {
      // Skip corrupted entry
    }
  }

  return entries;
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseXlsxZip(entries: Map<string, string>, maxChars: number): string {
  // 1. Parse xl/sharedStrings.xml
  const sharedStrings: string[] = [];
  const sharedXml = entries.get('xl/sharedStrings.xml');
  if (sharedXml) {
    const siMatches = sharedXml.match(/<si[\s>][\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
      const text = tMatches
        .map(t => decodeXmlEntities(t.replace(/<\/?t(?:\s[^>]*)?>/g, '')))
        .join('');
      sharedStrings.push(text);
    }
  }

  // 2. Parse sheet names from xl/workbook.xml
  const sheetNames: string[] = [];
  const workbookXml = entries.get('xl/workbook.xml');
  if (workbookXml) {
    const sheetTags = workbookXml.match(/<sheet\s+[^>]*?>/g) || [];
    for (const tag of sheetTags) {
      const nameMatch = tag.match(/\bname="([^"]+)"/);
      if (nameMatch) {
        sheetNames.push(decodeXmlEntities(nameMatch[1]));
      }
    }
  }

  // 3. Parse worksheets xl/worksheets/sheet1.xml, sheet2.xml...
  const sheetKeys = Array.from(entries.keys())
    .filter(k => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const outputLines: string[] = [];
  let charCount = 0;

  sheetKeys.forEach((key, idx) => {
    if (charCount >= maxChars) return;
    const xml = entries.get(key) || '';
    const title = sheetNames[idx] || `Sheet ${idx + 1}`;
    const header = `=== ${title} ===`;
    outputLines.push(header);
    charCount += header.length + 1;

    const rowMatches = xml.match(/<row[\s>][\s\S]*?<\/row>/g) || [];
    for (const rowXml of rowMatches) {
      if (charCount >= maxChars) break;
      const cellMatches = rowXml.match(/<c[\s>][\s\S]*?(?:<\/c>|\/>)/g) || [];
      const rowValues: string[] = [];

      for (const cellXml of cellMatches) {
        const typeMatch = cellXml.match(/\bt="([^"]+)"/);
        const cellType = typeMatch ? typeMatch[1] : '';

        if (cellType === 'inlineStr') {
          const tMatches = cellXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
          const val = tMatches
            .map(t => decodeXmlEntities(t.replace(/<\/?t(?:\s[^>]*)?>/g, '')))
            .join('');
          if (val) rowValues.push(val);
        } else {
          const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
          if (vMatch) {
            const rawVal = decodeXmlEntities(vMatch[1]);
            if (cellType === 's') {
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
        const line = rowValues.join('\t');
        outputLines.push(line);
        charCount += line.length + 1;
      }
    }

    outputLines.push('');
  });

  return outputLines.join('\n').trim().slice(0, maxChars);
}

function parseOdsZip(entries: Map<string, string>, maxChars: number): string {
  const contentXml = entries.get('content.xml');
  if (!contentXml) return '';

  const rows = contentXml.match(/<table:table-row[\s>][\s\S]*?<\/table:table-row>/g) || [];
  const lines: string[] = [];
  let totalChars = 0;

  for (const row of rows) {
    if (totalChars >= maxChars) break;
    const pMatches = row.match(/<text:p(?:\s[^>]*)?>([\s\S]*?)<\/text:p>/g) || [];
    const values = pMatches
      .map(p => decodeXmlEntities(p.replace(/<[^>]+>/g, '')).trim())
      .filter(Boolean);
    if (values.length > 0) {
      const line = values.join('\t');
      lines.push(line);
      totalChars += line.length + 1;
    }
  }

  return lines.join('\n').slice(0, maxChars);
}

function extractBinarySpreadsheetStrings(buffer: Buffer, maxChars: number): string {
  // Extract printable ASCII and UTF-16LE runs from legacy .xls BIFF files
  const asciiRuns = buffer.toString('latin1').match(/[\x20-\x7E]{4,}/g) || [];
  const filtered = asciiRuns.filter(
    s => !/^(Root Entry|Workbook|SummaryInformation|DocumentSummaryInformation|CompObj)$/i.test(s.trim())
  );
  return filtered.join('\n').slice(0, maxChars);
}

/**
 * Extracts plain text from spreadsheet buffers (.xlsx, .xlsm, .ods, .xls, .csv, .tsv)
 * for both FTS5 indexing and inline preview.
 */
export function extractSpreadsheetTextFromBuffer(
  buffer: Buffer,
  extension: string,
  maxChars = 2_000_000
): string {
  const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;

  if (ext === '.csv' || ext === '.tsv') {
    return buffer.toString('utf8').replace(/\0/g, '').slice(0, maxChars);
  }

  if (ext === '.xlsx' || ext === '.xlsm') {
    const entries = readZipEntries(buffer);
    const parsed = parseXlsxZip(entries, maxChars);
    return parsed || extractBinarySpreadsheetStrings(buffer, maxChars);
  }

  if (ext === '.ods') {
    const entries = readZipEntries(buffer);
    const parsed = parseOdsZip(entries, maxChars);
    return parsed || extractBinarySpreadsheetStrings(buffer, maxChars);
  }

  if (ext === '.xls') {
    return extractBinarySpreadsheetStrings(buffer, maxChars);
  }

  return buffer.toString('utf8').replace(/\0/g, '').slice(0, maxChars);
}

