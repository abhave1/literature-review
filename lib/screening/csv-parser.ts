/**
 * CSV Parser for Literature Screening
 * Parses CSV files and returns structured data
 */

import * as XLSX from 'xlsx';

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  fileName: string;
}

export interface ArticleRow {
  id: string;
  originalIndex: number;
  title: string;
  abstract: string;
  year: string;
  journal: string;
  keywords: string;
  originalColumns: Record<string, string>;
}

/**
 * Parse a CSV file and return headers and rows
 */
export async function parseCSV(file: File): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 }); // UTF-8

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Get raw data as array of arrays
        const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];

        if (rawData.length === 0) {
          reject(new Error('CSV file is empty'));
          return;
        }

        // First row is headers
        const headers = rawData[0].map(h => String(h).trim());

        // Remaining rows are data
        const rows = rawData.slice(1).map((row, index) => {
          const rowObj: Record<string, string> = { __rowIndex: String(index) };
          headers.forEach((header, i) => {
            rowObj[header] = row[i] !== undefined ? String(row[i]).trim() : '';
          });
          return rowObj;
        });

        // Filter out completely empty rows
        const nonEmptyRows = rows.filter(row =>
          Object.entries(row)
            .filter(([key]) => key !== '__rowIndex')
            .some(([, value]) => value !== '')
        );

        resolve({
          headers,
          rows: nonEmptyRows,
          rowCount: nonEmptyRows.length,
          fileName: file.name,
        });
      } catch (error) {
        reject(new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert parsed CSV rows to ArticleRow format using column mapping
 */
export function mapToArticleRows(
  parsedCSV: ParsedCSV,
  columnMapping: {
    title: string;
    abstract: string;
    year: string;
    journal: string;
    keywords: string;
  }
): ArticleRow[] {
  return parsedCSV.rows.map((row, index) => {
    // Combine multiple keyword columns if needed
    let keywords = '';
    if (columnMapping.keywords) {
      // Keywords might be comma-separated column names
      const keywordCols = columnMapping.keywords.split(',').map(k => k.trim());
      keywords = keywordCols
        .map(col => row[col] || '')
        .filter(k => k)
        .join('; ');
    }

    return {
      id: `article-${index}-${Date.now()}`,
      originalIndex: index,
      title: row[columnMapping.title] || '',
      abstract: row[columnMapping.abstract] || '',
      year: row[columnMapping.year] || '',
      journal: row[columnMapping.journal] || '',
      keywords,
      originalColumns: { ...row },
    };
  });
}

/**
 * Get preview of first N rows for display
 */
export function getPreviewRows(parsedCSV: ParsedCSV, count: number = 5): Record<string, string>[] {
  return parsedCSV.rows.slice(0, count);
}

/**
 * Validate that required columns exist in the mapping
 */
export function validateColumnMapping(
  headers: string[],
  mapping: {
    title: string;
    abstract: string;
    year: string;
    journal: string;
    keywords: string;
  }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const headerSet = new Set(headers);

  if (!mapping.title || !headerSet.has(mapping.title)) {
    errors.push(`Title column "${mapping.title}" not found in CSV`);
  }
  if (!mapping.abstract || !headerSet.has(mapping.abstract)) {
    errors.push(`Abstract column "${mapping.abstract}" not found in CSV`);
  }
  if (!mapping.year || !headerSet.has(mapping.year)) {
    errors.push(`Year column "${mapping.year}" not found in CSV`);
  }
  if (!mapping.journal || !headerSet.has(mapping.journal)) {
    errors.push(`Journal column "${mapping.journal}" not found in CSV`);
  }
  // Keywords are optional
  if (mapping.keywords) {
    const keywordCols = mapping.keywords.split(',').map(k => k.trim());
    const missingKeywords = keywordCols.filter(col => !headerSet.has(col));
    if (missingKeywords.length > 0) {
      errors.push(`Keywords column(s) "${missingKeywords.join(', ')}" not found in CSV`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
