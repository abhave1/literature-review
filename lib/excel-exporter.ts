/**
 * Excel/CSV exporter for parsed aspect analysis results
 * Generates downloadable Excel files with segmented aspect data
 */

import * as XLSX from 'xlsx';
import { parseAspects, ParsedAnalysis } from './aspect-parser';

interface AnalysisResult {
  fileName: string;
  success: boolean;
  data?: {
    extractedText: string;
    metadata: any;
    analysis: any;
  };
  error?: string;
}

/**
 * Export analysis results to Excel file
 * One row per PDF, with aspects as columns
 */
export function exportToExcel(results: AnalysisResult[]): void {
  // First pass: determine the maximum number of aspects across all files
  let maxAspects = 0;
  const parsedResults: Array<{ fileName: string; parsed: ParsedAnalysis; error?: string }> = [];

  for (const result of results) {
    if (!result.success || !result.data?.analysis) {
      parsedResults.push({
        fileName: result.fileName,
        parsed: { title: '', aspects: [], rawText: '', hasAspects: false },
        error: result.error || 'Unknown error',
      });
      continue;
    }

    const analysisText = typeof result.data.analysis === 'string'
      ? result.data.analysis
      : JSON.stringify(result.data.analysis);

    const parsed = parseAspects(analysisText);
    parsedResults.push({ fileName: result.fileName, parsed });

    if (parsed.aspects.length > maxAspects) {
      maxAspects = parsed.aspects.length;
    }
  }

  // Build rows with dynamic columns
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Add each aspect with all subsections (a), (b), (c)
      for (let i = 0; i < parsed.aspects.length; i++) {
        const aspect = parsed.aspects[i];
        const aspectNum = i + 1;
        const baseTitle = aspect.aspectTitle || `Aspect ${aspectNum}`;

        // Combine all subsections with labels
        let combinedContent = '';
        if (aspect.subsectionA) {
          combinedContent += `(a) ${aspect.subsectionA}`;
        }
        if (aspect.subsectionB) {
          combinedContent += combinedContent ? `\n\n(b) ${aspect.subsectionB}` : `(b) ${aspect.subsectionB}`;
        }
        if (aspect.subsectionC) {
          combinedContent += combinedContent ? `\n\n(c) ${aspect.subsectionC}` : `(c) ${aspect.subsectionC}`;
        }

        row[baseTitle] = combinedContent;
      }
    }

    rows.push(row);
  }

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths (FileName + dynamic aspect columns)
  const colWidths = [{ wch: 30 }]; // File Name column
  for (let i = 0; i < maxAspects; i++) {
    colWidths.push({ wch: 80 }); // Wider columns for combined content
  }
  worksheet['!cols'] = colWidths;

  // Create workbook and add worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Analysis Results');

  // Generate Excel file and trigger download
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `analysis-aspects-${timestamp}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}

/**
 * Export analysis results to CSV file
 * One row per PDF, with aspects as columns (same as Excel)
 */
export function exportToCSV(results: AnalysisResult[]): void {
  // First pass: determine the maximum number of aspects across all files
  let maxAspects = 0;
  const parsedResults: Array<{ fileName: string; parsed: ParsedAnalysis; error?: string }> = [];

  for (const result of results) {
    if (!result.success || !result.data?.analysis) {
      parsedResults.push({
        fileName: result.fileName,
        parsed: { title: '', aspects: [], rawText: '', hasAspects: false },
        error: result.error || 'Unknown error',
      });
      continue;
    }

    const analysisText = typeof result.data.analysis === 'string'
      ? result.data.analysis
      : JSON.stringify(result.data.analysis);

    const parsed = parseAspects(analysisText);
    parsedResults.push({ fileName: result.fileName, parsed });

    if (parsed.aspects.length > maxAspects) {
      maxAspects = parsed.aspects.length;
    }
  }

  // Build rows with dynamic columns
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Add each aspect with all subsections (a), (b), (c)
      for (let i = 0; i < parsed.aspects.length; i++) {
        const aspect = parsed.aspects[i];
        const aspectNum = i + 1;
        const baseTitle = aspect.aspectTitle || `Aspect ${aspectNum}`;

        // Combine all subsections with labels
        let combinedContent = '';
        if (aspect.subsectionA) {
          combinedContent += `(a) ${aspect.subsectionA}`;
        }
        if (aspect.subsectionB) {
          combinedContent += combinedContent ? `\n\n(b) ${aspect.subsectionB}` : `(b) ${aspect.subsectionB}`;
        }
        if (aspect.subsectionC) {
          combinedContent += combinedContent ? `\n\n(c) ${aspect.subsectionC}` : `(c) ${aspect.subsectionC}`;
        }

        row[baseTitle] = combinedContent;
      }
    }

    rows.push(row);
  }

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Convert to CSV
  const csv = XLSX.utils.sheet_to_csv(worksheet);

  // Create blob and download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  link.href = url;
  link.download = `analysis-aspects-${timestamp}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

/**
 * Helper function to filter text before the dash " - "
 * Removes reasoning/conclusions, keeping only the answer part
 */
function filterBeforeDash(text: string): string {
  const dashIndex = text.indexOf(' - ');
  if (dashIndex === -1) {
    return text.trim();
  }
  return text.substring(0, dashIndex).trim();
}

/**
 * Export filtered analysis results to Excel file (answers only, no reasoning)
 * Removes everything after " - " in each response
 */
export function exportFilteredToExcel(results: AnalysisResult[]): void {
  // First pass: determine the maximum number of aspects across all files
  let maxAspects = 0;
  const parsedResults: Array<{ fileName: string; parsed: ParsedAnalysis; error?: string }> = [];

  for (const result of results) {
    if (!result.success || !result.data?.analysis) {
      parsedResults.push({
        fileName: result.fileName,
        parsed: { title: '', aspects: [], rawText: '', hasAspects: false },
        error: result.error || 'Unknown error',
      });
      continue;
    }

    const analysisText = typeof result.data.analysis === 'string'
      ? result.data.analysis
      : JSON.stringify(result.data.analysis);

    const parsed = parseAspects(analysisText);
    parsedResults.push({ fileName: result.fileName, parsed });

    if (parsed.aspects.length > maxAspects) {
      maxAspects = parsed.aspects.length;
    }
  }

  // Build rows with dynamic columns (filtered content)
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Add each aspect with only subsection (a) filtered
      for (let i = 0; i < parsed.aspects.length; i++) {
        const aspect = parsed.aspects[i];
        const aspectNum = i + 1;
        const baseTitle = aspect.aspectTitle || `Aspect ${aspectNum}`;

        // Only include subsection (a), filtered before dash
        if (aspect.subsectionA) {
          const filtered = filterBeforeDash(aspect.subsectionA);
          row[baseTitle] = filtered;
        } else {
          row[baseTitle] = '';
        }
      }
    }

    rows.push(row);
  }

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths (FileName + dynamic aspect columns)
  const colWidths = [{ wch: 30 }]; // File Name column
  for (let i = 0; i < maxAspects; i++) {
    colWidths.push({ wch: 50 }); // Narrower columns since content is shorter
  }
  worksheet['!cols'] = colWidths;

  // Create workbook and add worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Filtered Results');

  // Generate Excel file and trigger download
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `analysis-answers-only-${timestamp}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}

/**
 * Get export statistics
 */
export function getExportStats(results: AnalysisResult[]): {
  totalFiles: number;
  filesWithAspects: number;
  totalAspects: number;
} {
  let filesWithAspects = 0;
  let totalAspects = 0;

  for (const result of results) {
    if (!result.success || !result.data?.analysis) {
      continue;
    }

    const analysisText = typeof result.data.analysis === 'string'
      ? result.data.analysis
      : JSON.stringify(result.data.analysis);

    const parsed = parseAspects(analysisText);

    if (parsed.hasAspects && parsed.aspects.length > 0) {
      filesWithAspects++;
      totalAspects += parsed.aspects.length;
    }
  }

  return {
    totalFiles: results.length,
    filesWithAspects,
    totalAspects,
  };
}
