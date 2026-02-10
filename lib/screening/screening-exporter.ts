/**
 * Screening Exporter for Literature Screening
 * Exports screening results to Excel and CSV formats
 */

import * as XLSX from 'xlsx';
import type { ArticleRow } from './csv-parser';
import type { ScreeningResult } from './response-parser';

export interface ExportOptions {
  includeRawResponse: boolean;
  includeTimestamp: boolean;
  includeParseStatus: boolean;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeRawResponse: false,
  includeTimestamp: true,
  includeParseStatus: true,
};

/**
 * Export screening results to Excel format
 * Merges original CSV columns with screening results
 */
export function exportScreeningToExcel(
  articles: ArticleRow[],
  results: ScreeningResult[],
  fileName: string = 'screening-results',
  options: Partial<ExportOptions> = {}
): void {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const rows = buildExportRows(articles, results, opts);

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  const colWidths = calculateColumnWidths(rows);
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Screening Results');

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  XLSX.writeFile(workbook, `${fileName}-${timestamp}.xlsx`);
}

/**
 * Export screening results to CSV format
 */
export function exportScreeningToCSV(
  articles: ArticleRow[],
  results: ScreeningResult[],
  fileName: string = 'screening-results',
  options: Partial<ExportOptions> = {}
): void {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const rows = buildExportRows(articles, results, opts);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csvContent = XLSX.utils.sheet_to_csv(worksheet);

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  link.href = url;
  link.download = `${fileName}-${timestamp}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

/**
 * Export only the decisions (compact format)
 */
export function exportDecisionsOnly(
  articles: ArticleRow[],
  results: ScreeningResult[],
  fileName: string = 'screening-decisions'
): void {
  const resultMap = new Map(results.map(r => [r.articleId, r]));

  const rows = articles.map(article => {
    const result = resultMap.get(article.id);
    return {
      'Row': article.originalIndex + 1,
      'Title': article.title,
      'Year': article.year,
      'Journal': article.journal,
      'Decision': result?.decision || 'Pending',
      'Rules_Used': result?.rulesUsed || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 6 },  // Row
    { wch: 60 }, // Title
    { wch: 8 },  // Year
    { wch: 40 }, // Journal
    { wch: 12 }, // Decision
    { wch: 30 }, // Rules_Used
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Decisions');

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  XLSX.writeFile(workbook, `${fileName}-${timestamp}.xlsx`);
}

/**
 * Build export rows by merging articles with results
 */
function buildExportRows(
  articles: ArticleRow[],
  results: ScreeningResult[],
  options: ExportOptions
): Record<string, string | number>[] {
  const resultMap = new Map(results.map(r => [r.articleId, r]));

  return articles.map(article => {
    const result = resultMap.get(article.id);

    // Start with original columns (excluding internal fields)
    const row: Record<string, string | number> = {};

    // Add original columns first
    for (const [key, value] of Object.entries(article.originalColumns)) {
      if (key !== '__rowIndex') {
        row[key] = value;
      }
    }

    // Add screening result columns
    row['_Screening_Decision'] = result?.decision || 'Pending';
    row['_Screening_Rules_Used'] = result?.rulesUsed || '';
    row['_Screening_Explanation'] = result?.explanation || '';

    if (options.includeTimestamp && result) {
      row['_Screening_Processed_At'] = result.processedAt;
    }

    if (options.includeParseStatus && result) {
      row['_Screening_Parse_Success'] = result.parseSuccess ? 'Yes' : 'No';
      if (result.parseError) {
        row['_Screening_Parse_Error'] = result.parseError;
      }
    }

    if (options.includeRawResponse && result) {
      row['_Screening_Raw_Response'] = result.rawResponse;
    }

    return row;
  });
}

/**
 * Calculate appropriate column widths based on content
 */
function calculateColumnWidths(
  rows: Record<string, string | number>[]
): { wch: number }[] {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const widths: { wch: number }[] = [];

  for (const header of headers) {
    // Get max content length for this column
    let maxLength = header.length;

    for (const row of rows.slice(0, 100)) { // Sample first 100 rows
      const value = String(row[header] || '');
      maxLength = Math.max(maxLength, Math.min(value.length, 100));
    }

    // Set width with min/max bounds
    const width = Math.max(10, Math.min(maxLength + 2, 80));
    widths.push({ wch: width });
  }

  return widths;
}

/**
 * Get export statistics
 */
export function getExportStats(
  articles: ArticleRow[],
  results: ScreeningResult[]
): {
  totalArticles: number;
  processedCount: number;
  pendingCount: number;
} {
  const processedIds = new Set(results.map(r => r.articleId));

  return {
    totalArticles: articles.length,
    processedCount: results.length,
    pendingCount: articles.length - processedIds.size,
  };
}
