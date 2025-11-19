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

  // Check if the text contains aspect markers (with optional markdown headers ###)
  const aspectRegex = /###\s+Aspect\s+\(\d+\)\s+-\s+/gi;
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
  const firstAspectMatch = trimmedText.match(/###\s+Aspect\s+\(\d+\)\s+-\s+/i);
  const title = firstAspectMatch
    ? trimmedText.substring(0, firstAspectMatch.index).trim()
    : '';

  // Split by aspect boundaries
  const aspectSplitRegex = /(?=###\s+Aspect\s+\(\d+\)\s+-\s+)/gi;
  const aspectSections = trimmedText
    .split(aspectSplitRegex)
    .filter(s => s.trim().length > 0);

  const aspects: ParsedAspect[] = [];

  for (const section of aspectSections) {
    const sectionTrimmed = section.trim();

    // Skip if it doesn't start with ### Aspect
    if (!/^###\s+Aspect\s+\(\d+\)\s+-\s+/i.test(sectionTrimmed)) {
      continue;
    }

    // Extract aspect number and title
    const aspectHeaderMatch = sectionTrimmed.match(/^###\s+Aspect\s+\((\d+)\)\s+-\s+(.+?)$/im);

    if (!aspectHeaderMatch) {
      continue;
    }

    const aspectNumber = parseInt(aspectHeaderMatch[1], 10);
    const aspectTitle = normalizeTitle(aspectHeaderMatch[2]);

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
 * Normalize aspect title by removing extra whitespace and standardizing spacing
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')  // Replace multiple spaces/newlines with single space
    .trim();                // Trim leading/trailing whitespace
}

/**
 * Extract a specific subsection (a), (b), or (c) from an aspect section
 */
function extractSubsection(text: string, subsectionLabel: string): string {
  // Match pattern: (a) or (b) or (c) followed by content until next subsection or end
  const pattern = new RegExp(
    `\\(${subsectionLabel}\\)\\s+([\\s\\S]*?)(?=\\n\\([a-z]\\)\\s+|$)`,
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
  const aspectRegex = /(?:###\s+)?Aspect\s*\(\d+\)/i;
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
