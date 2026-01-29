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

/**
 * Parsed aspect definition from the prompt
 */
export interface AspectDefinition {
  number: number;
  title: string;
  description: string;
}

/**
 * Parse rated aspects from the prompt text to extract column headers
 * Expected format:
 * (1) Title of aspect
 * Description text...
 *
 * (2) Another aspect
 * Description...
 */
export function parseRatedAspects(ratedAspectsText: string): AspectDefinition[] {
  if (!ratedAspectsText || typeof ratedAspectsText !== 'string') {
    return [];
  }

  const aspects: AspectDefinition[] = [];

  // Match pattern: (N) or N. or N) followed by the title on the same line
  // The description follows on subsequent lines until the next aspect header or end
  const aspectPattern = /(?:\((\d+)\)|^(\d+)[.)]\s)([^\n]+)/gm;

  let match;
  const matches: { number: number; title: string; startIndex: number }[] = [];

  const seenNumbers = new Set<number>();
  while ((match = aspectPattern.exec(ratedAspectsText)) !== null) {
    // Group 1 = (N) format, Group 2 = N. format, Group 3 = title text
    const num = parseInt(match[1] || match[2], 10);
    const title = match[3].trim();
    // Only keep the first occurrence of each aspect number to avoid duplicate columns
    if (seenNumbers.has(num)) {
      continue;
    }
    seenNumbers.add(num);
    matches.push({
      number: num,
      title,
      startIndex: match.index + match[0].length,
    });
  }

  // Extract descriptions (text between aspect headers)
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStartIndex = i < matches.length - 1
      ? ratedAspectsText.indexOf(`(${matches[i + 1].number})`, current.startIndex)
      : ratedAspectsText.length;

    const description = ratedAspectsText
      .substring(current.startIndex, nextStartIndex)
      .trim();

    aspects.push({
      number: current.number,
      title: current.title,
      description,
    });
  }

  return aspects;
}

/**
 * Get aspect titles as a map from aspect number to title
 * Used for consistent column naming in exports
 */
export function getAspectTitlesMap(ratedAspectsText: string): Map<number, string> {
  const aspects = parseRatedAspects(ratedAspectsText);
  const map = new Map<number, string>();

  for (const aspect of aspects) {
    map.set(aspect.number, aspect.title);
  }

  return map;
}

/**
 * Get ordered aspect titles from the prompt
 * Returns titles in the order they appear (by aspect number)
 */
export function getOrderedAspectTitles(ratedAspectsText: string): string[] {
  const aspects = parseRatedAspects(ratedAspectsText);
  // Sort by number and return just the titles
  return aspects
    .sort((a, b) => a.number - b.number)
    .map(a => a.title);
}
