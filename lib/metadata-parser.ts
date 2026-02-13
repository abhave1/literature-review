/**
 * Metadata Parser for Article Metadata Spreadsheets
 * Parses .xlsx/.csv files with article metadata and maps them by filename
 */

import * as XLSX from 'xlsx';

export interface MetadataRow {
  authors: string;
  year: string;
  title: string;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  abstract: string;
  keywords: string;
  documentType: string;
  language: string;
  database: string;
  originalColumns: Record<string, string>;
}

export type MetadataMap = Map<string, MetadataRow>;

export interface MetadataParseResult {
  metadata: MetadataMap;
  headers: string[];
  rowCount: number;
  filenameColumn: string;
}

export interface MetadataMismatch {
  filesNotInMetadata: string[];
  metadataNotInFiles: string[];
  matchedCount: number;
}

/**
 * Normalize a filename for matching:
 * - trim whitespace, lowercase
 * - replace special chars (apostrophes, smart quotes, question marks) with underscore
 * - collapse double .pdf.pdf extension
 */
export function normalizeFilename(filename: string): string {
  let normalized = filename.trim().toLowerCase();
  // Replace curly/smart quotes and straight apostrophes with underscore
  normalized = normalized.replace(/[\u2018\u2019\u201C\u201D'`?]/g, '_');
  // Fix double .pdf.pdf extension
  normalized = normalized.replace(/\.pdf\.pdf$/i, '.pdf');
  return normalized;
}

/**
 * Known aliases for the filename column (case-insensitive matching)
 */
const FILENAME_COLUMN_ALIASES = [
  'filename in ai bot',
  'filename',
  'file name',
  'file_name',
  'pdf filename',
  'pdf_filename',
  'pdf file',
];

/**
 * Find the filename column in the headers
 */
function findFilenameColumn(headers: string[]): string | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  for (const alias of FILENAME_COLUMN_ALIASES) {
    const idx = lowerHeaders.indexOf(alias);
    if (idx !== -1) {
      return headers[idx];
    }
  }
  return null;
}

/**
 * Metadata column mapping: display name → possible header aliases (lowercase)
 */
const METADATA_COLUMN_MAP: { key: keyof Omit<MetadataRow, 'originalColumns'>; display: string; aliases: string[] }[] = [
  { key: 'authors', display: 'Authors', aliases: ['authors', 'author', 'author(s)', 'au'] },
  { key: 'year', display: 'Year', aliases: ['year', 'publication year', 'pub year', 'py'] },
  { key: 'title', display: 'Article Title', aliases: ['title', 'article title', 'document title', 'ti'] },
  { key: 'journal', display: 'Journal', aliases: ['journal', 'source title', 'source', 'journal name', 'so', 'publication name'] },
  { key: 'volume', display: 'Volume', aliases: ['volume', 'vol', 'vl'] },
  { key: 'issue', display: 'Issue', aliases: ['issue', 'is', 'number'] },
  { key: 'pages', display: 'Pages', aliases: ['pages', 'page start', 'page range', 'bp', 'ep'] },
  { key: 'doi', display: 'DOI', aliases: ['doi', 'di', 'digital object identifier'] },
  { key: 'abstract', display: 'Abstract', aliases: ['abstract', 'ab'] },
  { key: 'keywords', display: 'Keywords', aliases: ['keywords', 'author keywords', 'index keywords', 'de', 'id'] },
  { key: 'documentType', display: 'Document Type', aliases: ['document type', 'type', 'dt', 'doc type'] },
  { key: 'language', display: 'Language', aliases: ['language', 'la', 'lang'] },
  { key: 'database', display: 'Database', aliases: ['database', 'db', 'source database'] },
];

/**
 * Returns the 13 metadata column display names in fixed order (excluding filename key column)
 */
export function getMetadataColumnHeaders(): string[] {
  return METADATA_COLUMN_MAP.map(col => col.display);
}

/**
 * Find a matching header for a given metadata field
 */
function findColumnValue(headers: string[], row: Record<string, string>, aliases: string[]): string {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lowerHeaders.indexOf(alias);
    if (idx !== -1) {
      return row[headers[idx]] || '';
    }
  }
  return '';
}

/**
 * Parse a metadata file (.xlsx, .xls, or .csv) and return a MetadataMap keyed by normalized filename
 */
export async function parseMetadataFile(file: File): Promise<MetadataParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];

        if (rawData.length === 0) {
          reject(new Error('File is empty'));
          return;
        }

        // First row is headers
        const headers = rawData[0].map(h => String(h).trim());

        // Find the filename column
        const filenameColumn = findFilenameColumn(headers);
        if (!filenameColumn) {
          reject(new Error(
            `Could not find a filename column. Expected one of: ${FILENAME_COLUMN_ALIASES.map(a => `"${a}"`).join(', ')}. ` +
            `Found columns: ${headers.join(', ')}`
          ));
          return;
        }

        // Parse rows
        const rows = rawData.slice(1).map((row) => {
          const rowObj: Record<string, string> = {};
          headers.forEach((header, i) => {
            rowObj[header] = row[i] !== undefined ? String(row[i]).trim() : '';
          });
          return rowObj;
        });

        // Filter out empty rows
        const nonEmptyRows = rows.filter(row =>
          Object.values(row).some(value => value !== '')
        );

        // Build MetadataMap
        const metadata: MetadataMap = new Map();

        for (const row of nonEmptyRows) {
          const rawFilename = row[filenameColumn];
          if (!rawFilename) continue;

          const key = normalizeFilename(rawFilename);

          const metadataRow: MetadataRow = {
            authors: '',
            year: '',
            title: '',
            journal: '',
            volume: '',
            issue: '',
            pages: '',
            doi: '',
            abstract: '',
            keywords: '',
            documentType: '',
            language: '',
            database: '',
            originalColumns: { ...row },
          };

          // Map each known metadata field
          for (const col of METADATA_COLUMN_MAP) {
            metadataRow[col.key] = findColumnValue(headers, row, col.aliases);
          }

          metadata.set(key, metadataRow);
        }

        resolve({
          metadata,
          headers,
          rowCount: nonEmptyRows.length,
          filenameColumn,
        });
      } catch (error) {
        reject(new Error(`Failed to parse metadata file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Detect mismatches between analysis file names and metadata
 */
export function detectMismatches(analysisFileNames: string[], metadataMap: MetadataMap): MetadataMismatch {
  const normalizedAnalysis = analysisFileNames.map(f => normalizeFilename(f));
  const metadataKeys = new Set(metadataMap.keys());

  const filesNotInMetadata: string[] = [];
  let matchedCount = 0;

  for (let i = 0; i < analysisFileNames.length; i++) {
    if (metadataKeys.has(normalizedAnalysis[i])) {
      matchedCount++;
    } else {
      filesNotInMetadata.push(analysisFileNames[i]);
    }
  }

  const analysisSet = new Set(normalizedAnalysis);
  const metadataNotInFiles: string[] = [];
  for (const [key, row] of metadataMap.entries()) {
    if (!analysisSet.has(key)) {
      // Use the original filename from the row for display
      const originalFilename = Object.values(row.originalColumns).find((_, idx) => idx === 0) || key;
      metadataNotInFiles.push(
        row.originalColumns[Object.keys(row.originalColumns)[0]] ? key : key
      );
    }
  }

  return {
    filesNotInMetadata,
    metadataNotInFiles,
    matchedCount,
  };
}
