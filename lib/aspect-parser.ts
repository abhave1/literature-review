/**
 * Parser for AI analysis output that segments content by "Aspect (N)" sections
 * Used to break down analysis results for structured Excel/CSV export
 */

export interface ParsedAspect {
  aspectNumber: number;
  aspectTitle: string;
  subsectionA: string;
  subsectionB: string;
  subsectionC: string;
  rawContent: string;
}

export interface ParsedAnalysis {
  title: string;
  aspects: ParsedAspect[];
  rawText: string;
  hasAspects: boolean;
}

/**
 * Parse AI analysis output into structured aspects
 * Expects format:
 * Title
 * Aspect (1) - Title
 * (a) content
 * (b) content
 * (c) content
 * Aspect (2) - Title
 * ...
 */
export function parseAspects(analysisText: string): ParsedAnalysis {
  if (!analysisText || typeof analysisText !== 'string') {
    return {
      title: '',
      aspects: [],
      rawText: analysisText || '',
      hasAspects: false,
    };
  }

  const trimmedText = analysisText.trim();

  // Check if the text contains aspect markers
  const aspectRegex = /Aspect\s*\((\d+)\)/gi;
  const hasAspects = aspectRegex.test(trimmedText);

  if (!hasAspects) {
    return {
      title: '',
      aspects: [],
      rawText: trimmedText,
      hasAspects: false,
    };
  }

  // Extract title (everything before first Aspect)
  const firstAspectMatch = trimmedText.match(/Aspect\s*\(\d+\)/i);
  const title = firstAspectMatch
    ? trimmedText.substring(0, firstAspectMatch.index).trim()
    : '';

  // Split by aspect boundaries
  const aspectSplitRegex = /(?=Aspect\s*\(\d+\))/gi;
  const aspectSections = trimmedText.split(aspectSplitRegex).filter(s => s.trim().length > 0);

  const aspects: ParsedAspect[] = [];

  for (const section of aspectSections) {
    const sectionTrimmed = section.trim();

    // Skip if it doesn't start with Aspect
    if (!/^Aspect\s*\(\d+\)/i.test(sectionTrimmed)) {
      continue;
    }

    // Extract aspect number and title
    const aspectHeaderMatch = sectionTrimmed.match(/^Aspect\s*\((\d+)\)\s*[-–—]\s*(.+?)$/im);

    if (!aspectHeaderMatch) {
      continue;
    }

    const aspectNumber = parseInt(aspectHeaderMatch[1], 10);
    const aspectTitle = aspectHeaderMatch[2].trim();

    // Extract subsections (a), (b), (c)
    const subsectionA = extractSubsection(sectionTrimmed, 'a');
    const subsectionB = extractSubsection(sectionTrimmed, 'b');
    const subsectionC = extractSubsection(sectionTrimmed, 'c');

    aspects.push({
      aspectNumber,
      aspectTitle,
      subsectionA,
      subsectionB,
      subsectionC,
      rawContent: sectionTrimmed,
    });
  }

  return {
    title,
    aspects,
    rawText: trimmedText,
    hasAspects: aspects.length > 0,
  };
}

/**
 * Extract a specific subsection (a), (b), or (c) from an aspect section
 */
function extractSubsection(text: string, subsectionLabel: string): string {
  // Match pattern: (a) or (b) or (c) followed by content until next subsection or end
  const pattern = new RegExp(
    `\\(${subsectionLabel}\\)\\s*([\\s\\S]*?)(?=\\([a-z]\\)|$)`,
    'i'
  );

  const match = text.match(pattern);

  if (!match) {
    return '';
  }

  // Clean up the extracted content
  return match[1].trim();
}

/**
 * Validate if a text contains parseable aspects
 */
export function hasAspectStructure(text: string): boolean {
  if (!text) return false;
  const aspectRegex = /Aspect\s*\(\d+\)/i;
  return aspectRegex.test(text);
}

/**
 * Get a summary of parsed aspects
 */
export function getAspectSummary(parsed: ParsedAnalysis): string {
  if (!parsed.hasAspects) {
    return 'No structured aspects found';
  }

  return `Found ${parsed.aspects.length} aspect${parsed.aspects.length !== 1 ? 's' : ''}`;
}
