/**
 * Response Parser for Literature Screening
 * Parses LLM responses to extract Decision, Rules Used, and Explanation
 */

export type ScreeningDecision = 'Include' | 'Exclude' | 'NoAbstract';

export interface ParsedScreeningResponse {
  decision: ScreeningDecision;
  rulesUsed: string;
  explanation: string;
  parseSuccess: boolean;
  parseError?: string;
}

export interface ScreeningResult {
  articleId: string;
  decision: ScreeningDecision;
  rulesUsed: string;
  explanation: string;
  rawResponse: string;
  processedAt: string;
  parseSuccess: boolean;
  parseError?: string;
}

/**
 * Parse the LLM response into structured screening result
 * Expected format:
 * Explanation: [text]
 * Rules Used: [text]
 * Decision: Include/Exclude/NoAbstract
 */
export function parseScreeningResponse(rawResponse: string): ParsedScreeningResponse {
  const lines = rawResponse.split('\n');

  let explanation = '';
  let rulesUsed = '';
  let decision: ScreeningDecision = 'NoAbstract';
  let foundDecision = false;

  // Parse each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.toLowerCase().startsWith('explanation:')) {
      // Explanation might span multiple lines until next field
      explanation = line.replace(/^explanation:\s*/i, '').trim();

      // Check if explanation continues on next lines
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (
          nextLine.toLowerCase().startsWith('rules used:') ||
          nextLine.toLowerCase().startsWith('rule used:') ||
          nextLine.toLowerCase().startsWith('decision:')
        ) {
          break;
        }
        if (nextLine) {
          explanation += ' ' + nextLine;
        }
      }
    } else if (
      line.toLowerCase().startsWith('rules used:') ||
      line.toLowerCase().startsWith('rule used:')
    ) {
      rulesUsed = line.replace(/^rules?\s*used:\s*/i, '').trim();
    } else if (line.toLowerCase().startsWith('decision:')) {
      const decisionText = line.replace(/^decision:\s*/i, '').trim().toLowerCase();
      foundDecision = true;

      if (decisionText === 'include' || decisionText.startsWith('include')) {
        decision = 'Include';
      } else if (decisionText === 'exclude' || decisionText.startsWith('exclude')) {
        decision = 'Exclude';
      } else if (decisionText === 'noabstract' || decisionText.includes('no abstract')) {
        decision = 'NoAbstract';
      } else {
        // Try to infer from the text
        if (decisionText.includes('include')) {
          decision = 'Include';
        } else if (decisionText.includes('exclude')) {
          decision = 'Exclude';
        }
      }
    }
  }

  // Validate parse success
  if (!foundDecision) {
    return {
      decision: 'NoAbstract',
      rulesUsed: rulesUsed || 'Parse Error',
      explanation: explanation || rawResponse.substring(0, 500),
      parseSuccess: false,
      parseError: 'Could not find Decision field in response',
    };
  }

  return {
    decision,
    rulesUsed: rulesUsed || 'Not specified',
    explanation: explanation || 'Not specified',
    parseSuccess: true,
  };
}

/**
 * Create a ScreeningResult from parsed response
 */
export function createScreeningResult(
  articleId: string,
  rawResponse: string
): ScreeningResult {
  const parsed = parseScreeningResponse(rawResponse);

  return {
    articleId,
    decision: parsed.decision,
    rulesUsed: parsed.rulesUsed,
    explanation: parsed.explanation,
    rawResponse,
    processedAt: new Date().toISOString(),
    parseSuccess: parsed.parseSuccess,
    parseError: parsed.parseError,
  };
}

/**
 * Quick check if abstract is missing (for client-side pre-screening)
 */
export function hasNoAbstract(abstract: string): boolean {
  if (!abstract) return true;
  const trimmed = abstract.trim().toLowerCase();
  if (trimmed === '') return true;
  if (trimmed === 'n/a' || trimmed === 'na' || trimmed === 'none') return true;
  if (trimmed === '[no abstract available]' || trimmed === '[no abstract]') return true;
  if (trimmed.length < 20) return true; // Very short abstracts are likely placeholders
  return false;
}

/**
 * Get decision color for UI display
 */
export function getDecisionColor(decision: ScreeningDecision): {
  bg: string;
  text: string;
  border: string;
} {
  switch (decision) {
    case 'Include':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
    case 'Exclude':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    case 'NoAbstract':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
  }
}

/**
 * Get summary statistics from results
 */
export function getResultStats(results: ScreeningResult[]): {
  total: number;
  include: number;
  exclude: number;
  noAbstract: number;
  parseErrors: number;
} {
  return {
    total: results.length,
    include: results.filter(r => r.decision === 'Include').length,
    exclude: results.filter(r => r.decision === 'Exclude').length,
    noAbstract: results.filter(r => r.decision === 'NoAbstract').length,
    parseErrors: results.filter(r => !r.parseSuccess).length,
  };
}

/**
 * Batch screening result from LLM
 */
export interface BatchScreeningResultItem {
  index: number;
  decision: string;
  rules_used: string;
  explanation: string;
}

export interface BatchScreeningResponse {
  results: BatchScreeningResultItem[];
}

/**
 * Parse batch screening JSON response from LLM
 */
export function parseBatchScreeningResponse(
  rawResponse: string,
  articleIds: string[]
): { results: ScreeningResult[]; parseSuccess: boolean; parseError?: string } {
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    let jsonStr = rawResponse.trim();

    // Remove markdown code block if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    // Parse JSON
    const parsed: BatchScreeningResponse = JSON.parse(jsonStr);

    if (!parsed.results || !Array.isArray(parsed.results)) {
      throw new Error('Response missing "results" array');
    }

    // Map results to ScreeningResult format
    const results: ScreeningResult[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < articleIds.length; i++) {
      const articleId = articleIds[i];
      const item = parsed.results.find(r => r.index === i) || parsed.results[i];

      if (!item) {
        // Missing result for this article
        results.push({
          articleId,
          decision: 'NoAbstract',
          rulesUsed: 'Parse Error',
          explanation: `No result found for article index ${i}`,
          rawResponse: '',
          processedAt: now,
          parseSuccess: false,
          parseError: 'Missing result in batch response',
        });
        continue;
      }

      // Validate and normalize decision
      let decision: ScreeningDecision = 'NoAbstract';
      const decisionLower = (item.decision || '').toLowerCase().trim();
      if (decisionLower === 'include') {
        decision = 'Include';
      } else if (decisionLower === 'exclude') {
        decision = 'Exclude';
      } else if (decisionLower === 'noabstract' || decisionLower === 'no abstract') {
        decision = 'NoAbstract';
      }

      results.push({
        articleId,
        decision,
        rulesUsed: item.rules_used || 'Not specified',
        explanation: item.explanation || 'No explanation provided',
        rawResponse: JSON.stringify(item),
        processedAt: now,
        parseSuccess: true,
      });
    }

    return { results, parseSuccess: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Return error results for all articles
    const now = new Date().toISOString();
    const results: ScreeningResult[] = articleIds.map(articleId => ({
      articleId,
      decision: 'NoAbstract' as ScreeningDecision,
      rulesUsed: 'Parse Error',
      explanation: `Batch parse failed: ${errorMsg}`,
      rawResponse: rawResponse.substring(0, 500),
      processedAt: now,
      parseSuccess: false,
      parseError: errorMsg,
    }));

    return { results, parseSuccess: false, parseError: errorMsg };
  }
}

/**
 * Validate batch response has all expected articles
 */
export function validateBatchResponse(
  results: ScreeningResult[],
  expectedCount: number
): { valid: boolean; missingIndices: number[] } {
  const missingIndices: number[] = [];

  for (let i = 0; i < expectedCount; i++) {
    if (!results[i] || !results[i].parseSuccess) {
      missingIndices.push(i);
    }
  }

  return {
    valid: missingIndices.length === 0,
    missingIndices,
  };
}
