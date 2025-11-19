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
  // First pass: parse all results and collect unique aspect titles
  const parsedResults: Array<{ fileName: string; parsed: ParsedAnalysis; error?: string }> = [];
  const aspectTitlesSet = new Set<string>();

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

    // Collect all unique aspect titles
    for (const aspect of parsed.aspects) {
      if (aspect.aspectTitle) {
        aspectTitlesSet.add(aspect.aspectTitle);
      }
    }
  }

  // Convert to sorted array for consistent column ordering
  const aspectTitles = Array.from(aspectTitlesSet).sort();

  // Build rows with dynamic columns
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Create a map of aspect titles to their content for this file
      const aspectMap = new Map<string, string>();

      for (const aspect of parsed.aspects) {
        const title = aspect.aspectTitle || '';

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

        if (title) {
          aspectMap.set(title, combinedContent);
        }
      }

      // Add columns for each standardized aspect title
      for (const aspectTitle of aspectTitles) {
        row[aspectTitle] = aspectMap.get(aspectTitle) || '';
      }
    }

    rows.push(row);
  }

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths (FileName + dynamic aspect columns)
  const colWidths = [{ wch: 30 }]; // File Name column
  for (let i = 0; i < aspectTitles.length; i++) {
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
  // First pass: parse all results and collect unique aspect titles
  const parsedResults: Array<{ fileName: string; parsed: ParsedAnalysis; error?: string }> = [];
  const aspectTitlesSet = new Set<string>();

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

    // Collect all unique aspect titles
    for (const aspect of parsed.aspects) {
      if (aspect.aspectTitle) {
        aspectTitlesSet.add(aspect.aspectTitle);
      }
    }
  }

  // Convert to sorted array for consistent column ordering
  const aspectTitles = Array.from(aspectTitlesSet).sort();

  // Build rows with dynamic columns
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Create a map of aspect titles to their content for this file
      const aspectMap = new Map<string, string>();

      for (const aspect of parsed.aspects) {
        const title = aspect.aspectTitle || '';

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

        if (title) {
          aspectMap.set(title, combinedContent);
        }
      }

      // Add columns for each standardized aspect title
      for (const aspectTitle of aspectTitles) {
        row[aspectTitle] = aspectMap.get(aspectTitle) || '';
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
  // First pass: parse all results and collect unique aspect titles
  const parsedResults: Array<{ fileName: string; parsed: ParsedAnalysis; error?: string }> = [];
  const aspectTitlesSet = new Set<string>();

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

    // Collect all unique aspect titles
    for (const aspect of parsed.aspects) {
      if (aspect.aspectTitle) {
        aspectTitlesSet.add(aspect.aspectTitle);
      }
    }
  }

  // Convert to sorted array for consistent column ordering
  const aspectTitles = Array.from(aspectTitlesSet).sort();

  // Build rows with dynamic columns (filtered content)
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Create a map of aspect titles to their filtered content for this file
      const aspectMap = new Map<string, string>();

      for (const aspect of parsed.aspects) {
        const title = aspect.aspectTitle || '';

        // Only include subsection (a), filtered before dash
        if (title && aspect.subsectionA) {
          const filtered = filterBeforeDash(aspect.subsectionA);
          aspectMap.set(title, filtered);
        }
      }

      // Add columns for each standardized aspect title
      for (const aspectTitle of aspectTitles) {
        row[aspectTitle] = aspectMap.get(aspectTitle) || '';
      }
    }

    rows.push(row);
  }

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths (FileName + dynamic aspect columns)
  const colWidths = [{ wch: 30 }]; // File Name column
  for (let i = 0; i < aspectTitles.length; i++) {
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
