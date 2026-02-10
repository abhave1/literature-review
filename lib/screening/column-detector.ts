/**
 * Column Detector for Literature Screening
 * Auto-detects CSV format (Scopus, Web of Science) and maps columns
 */

export interface ColumnMapping {
  title: string;
  abstract: string;
  year: string;
  journal: string;
  keywords: string;
}

export interface DetectionResult {
  format: 'scopus' | 'wos' | 'custom';
  mapping: ColumnMapping;
  confidence: number;
  detectedColumns: {
    title: string | null;
    abstract: string | null;
    year: string | null;
    journal: string | null;
    keywords: string | null;
  };
}

// Known column names for different formats
const SCOPUS_COLUMNS = {
  title: ['Title'],
  abstract: ['Abstract'],
  year: ['Year'],
  journal: ['Source title', 'Source Title'],
  keywords: ['Author Keywords', 'Index Keywords'],
};

const WOS_COLUMNS = {
  title: ['Article Title', 'Title'],
  abstract: ['Abstract'],
  year: ['Publication Year', 'Year'],
  journal: ['Source Title', 'Journal'],
  keywords: ['Author Keywords', 'Keywords Plus'],
};

// Generic fallback patterns (case-insensitive)
const GENERIC_PATTERNS = {
  title: [/^title$/i, /article.?title/i, /paper.?title/i],
  abstract: [/^abstract$/i, /summary/i],
  year: [/^year$/i, /publication.?year/i, /pub.?year/i],
  journal: [/^journal$/i, /source/i, /publication/i],
  keywords: [/keyword/i, /descriptor/i, /subject/i],
};

/**
 * Find a matching column from headers using exact matches first, then patterns
 */
function findColumn(
  headers: string[],
  exactMatches: string[],
  patterns: RegExp[]
): string | null {
  // Try exact matches first (case-insensitive)
  for (const exact of exactMatches) {
    const found = headers.find(h => h.toLowerCase() === exact.toLowerCase());
    if (found) return found;
  }

  // Try patterns
  for (const pattern of patterns) {
    const found = headers.find(h => pattern.test(h));
    if (found) return found;
  }

  return null;
}

/**
 * Detect CSV format and create column mapping
 */
export function detectFormat(headers: string[]): DetectionResult {
  const headerLower = headers.map(h => h.toLowerCase());

  // Count matches for each format
  let scopusMatches = 0;
  let wosMatches = 0;

  // Check Scopus columns
  for (const cols of Object.values(SCOPUS_COLUMNS)) {
    if (cols.some(c => headerLower.includes(c.toLowerCase()))) {
      scopusMatches++;
    }
  }

  // Check WoS columns
  for (const cols of Object.values(WOS_COLUMNS)) {
    if (cols.some(c => headerLower.includes(c.toLowerCase()))) {
      wosMatches++;
    }
  }

  // Determine format based on matches
  let format: 'scopus' | 'wos' | 'custom';
  let columnDefs: typeof SCOPUS_COLUMNS;
  let confidence: number;

  if (scopusMatches >= 4) {
    format = 'scopus';
    columnDefs = SCOPUS_COLUMNS;
    confidence = scopusMatches / 5;
  } else if (wosMatches >= 4) {
    format = 'wos';
    columnDefs = WOS_COLUMNS;
    confidence = wosMatches / 5;
  } else {
    format = 'custom';
    columnDefs = SCOPUS_COLUMNS; // Use Scopus as fallback
    confidence = Math.max(scopusMatches, wosMatches) / 5;
  }

  // Detect individual columns
  const detectedColumns = {
    title: findColumn(headers, columnDefs.title, GENERIC_PATTERNS.title),
    abstract: findColumn(headers, columnDefs.abstract, GENERIC_PATTERNS.abstract),
    year: findColumn(headers, columnDefs.year, GENERIC_PATTERNS.year),
    journal: findColumn(headers, columnDefs.journal, GENERIC_PATTERNS.journal),
    keywords: findColumn(headers, columnDefs.keywords, GENERIC_PATTERNS.keywords),
  };

  // Also check for second keywords column (common in Scopus)
  const keywordColumns: string[] = [];
  for (const kw of columnDefs.keywords) {
    const found = headers.find(h => h.toLowerCase() === kw.toLowerCase());
    if (found) keywordColumns.push(found);
  }

  // Create mapping
  const mapping: ColumnMapping = {
    title: detectedColumns.title || '',
    abstract: detectedColumns.abstract || '',
    year: detectedColumns.year || '',
    journal: detectedColumns.journal || '',
    keywords: keywordColumns.length > 0 ? keywordColumns.join(', ') : (detectedColumns.keywords || ''),
  };

  return {
    format,
    mapping,
    confidence,
    detectedColumns,
  };
}

/**
 * Get human-readable format name
 */
export function getFormatName(format: 'scopus' | 'wos' | 'custom'): string {
  switch (format) {
    case 'scopus':
      return 'Scopus';
    case 'wos':
      return 'Web of Science';
    case 'custom':
      return 'Custom/Unknown';
  }
}

/**
 * Create an empty mapping for manual configuration
 */
export function createEmptyMapping(): ColumnMapping {
  return {
    title: '',
    abstract: '',
    year: '',
    journal: '',
    keywords: '',
  };
}
