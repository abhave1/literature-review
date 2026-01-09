/**
 * Excel/CSV exporter for parsed aspect analysis results
 * Generates downloadable Excel files with segmented aspect data
 */

import * as XLSX from 'xlsx';
import { parseAspects, ParsedAnalysis, parseRatedAspects, AspectDefinition } from './aspect-parser';

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
 * @param results - Analysis results from the API
 * @param ratedAspects - Original rated aspects text from the prompt (used for fixed column headers)
 */
export function exportToExcel(results: AnalysisResult[], ratedAspects?: string): void {
  // Parse the rated aspects from the prompt to get fixed column headers
  const aspectDefinitions = ratedAspects ? parseRatedAspects(ratedAspects) : [];
  const useFixedColumns = aspectDefinitions.length > 0;

  // First pass: parse all results
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
  }

  // Get column headers - either from prompt or dynamically from results
  let aspectColumns: { number: number; title: string }[];

  if (useFixedColumns) {
    // Use fixed column headers from the prompt, sorted by aspect number
    aspectColumns = aspectDefinitions
      .sort((a, b) => a.number - b.number)
      .map(def => ({ number: def.number, title: def.title }));
  } else {
    // Fallback: collect unique aspect titles from results (old behavior)
    const aspectTitlesSet = new Set<string>();
    for (const { parsed } of parsedResults) {
      for (const aspect of parsed.aspects) {
        if (aspect.aspectTitle) {
          aspectTitlesSet.add(aspect.aspectTitle);
        }
      }
    }
    aspectColumns = Array.from(aspectTitlesSet)
      .sort()
      .map((title, i) => ({ number: i + 1, title }));
  }

  // Build rows with fixed columns
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Create a map of aspect NUMBER to content for this file
      const aspectByNumber = new Map<number, string>();

      for (const aspect of parsed.aspects) {
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

        // Store by aspect NUMBER for consistent matching
        aspectByNumber.set(aspect.aspectNumber, combinedContent);
      }

      // Add columns using the fixed aspect titles, matched by number
      for (const col of aspectColumns) {
        row[col.title] = aspectByNumber.get(col.number) || '';
      }
    }

    rows.push(row);
  }

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths (FileName + aspect columns)
  const colWidths = [{ wch: 30 }]; // File Name column
  for (let i = 0; i < aspectColumns.length; i++) {
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
 * @param results - Analysis results from the API
 * @param ratedAspects - Original rated aspects text from the prompt (used for fixed column headers)
 */
export function exportToCSV(results: AnalysisResult[], ratedAspects?: string): void {
  // Parse the rated aspects from the prompt to get fixed column headers
  const aspectDefinitions = ratedAspects ? parseRatedAspects(ratedAspects) : [];
  const useFixedColumns = aspectDefinitions.length > 0;

  // First pass: parse all results
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
  }

  // Get column headers - either from prompt or dynamically from results
  let aspectColumns: { number: number; title: string }[];

  if (useFixedColumns) {
    // Use fixed column headers from the prompt, sorted by aspect number
    aspectColumns = aspectDefinitions
      .sort((a, b) => a.number - b.number)
      .map(def => ({ number: def.number, title: def.title }));
  } else {
    // Fallback: collect unique aspect titles from results (old behavior)
    const aspectTitlesSet = new Set<string>();
    for (const { parsed } of parsedResults) {
      for (const aspect of parsed.aspects) {
        if (aspect.aspectTitle) {
          aspectTitlesSet.add(aspect.aspectTitle);
        }
      }
    }
    aspectColumns = Array.from(aspectTitlesSet)
      .sort()
      .map((title, i) => ({ number: i + 1, title }));
  }

  // Build rows with fixed columns
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Create a map of aspect NUMBER to content for this file
      const aspectByNumber = new Map<number, string>();

      for (const aspect of parsed.aspects) {
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

        // Store by aspect NUMBER for consistent matching
        aspectByNumber.set(aspect.aspectNumber, combinedContent);
      }

      // Add columns using the fixed aspect titles, matched by number
      for (const col of aspectColumns) {
        row[col.title] = aspectByNumber.get(col.number) || '';
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
 * @param results - Analysis results from the API
 * @param ratedAspects - Original rated aspects text from the prompt (used for fixed column headers)
 */
export function exportFilteredToExcel(results: AnalysisResult[], ratedAspects?: string): void {
  // Parse the rated aspects from the prompt to get fixed column headers
  const aspectDefinitions = ratedAspects ? parseRatedAspects(ratedAspects) : [];
  const useFixedColumns = aspectDefinitions.length > 0;

  // First pass: parse all results
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
  }

  // Get column headers - either from prompt or dynamically from results
  let aspectColumns: { number: number; title: string }[];

  if (useFixedColumns) {
    // Use fixed column headers from the prompt, sorted by aspect number
    aspectColumns = aspectDefinitions
      .sort((a, b) => a.number - b.number)
      .map(def => ({ number: def.number, title: def.title }));
  } else {
    // Fallback: collect unique aspect titles from results (old behavior)
    const aspectTitlesSet = new Set<string>();
    for (const { parsed } of parsedResults) {
      for (const aspect of parsed.aspects) {
        if (aspect.aspectTitle) {
          aspectTitlesSet.add(aspect.aspectTitle);
        }
      }
    }
    aspectColumns = Array.from(aspectTitlesSet)
      .sort()
      .map((title, i) => ({ number: i + 1, title }));
  }

  // Build rows with fixed columns (filtered content)
  const rows: any[] = [];

  for (const { fileName, parsed, error } of parsedResults) {
    const row: any = { 'File Name': fileName };

    if (error) {
      row['Error'] = error;
    } else if (!parsed.hasAspects || parsed.aspects.length === 0) {
      row['Note'] = 'No aspects found';
    } else {
      // Create a map of aspect NUMBER to filtered content for this file
      const aspectByNumber = new Map<number, string>();

      for (const aspect of parsed.aspects) {
        // Only include subsection (a), filtered before dash
        if (aspect.subsectionA) {
          const filtered = filterBeforeDash(aspect.subsectionA);
          aspectByNumber.set(aspect.aspectNumber, filtered);
        }
      }

      // Add columns using the fixed aspect titles, matched by number
      for (const col of aspectColumns) {
        row[col.title] = aspectByNumber.get(col.number) || '';
      }
    }

    rows.push(row);
  }

  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths (FileName + aspect columns)
  const colWidths = [{ wch: 30 }]; // File Name column
  for (let i = 0; i < aspectColumns.length; i++) {
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
