import 'server-only';
import type { ScreeningRubrics } from './default-rubrics';
export function buildScreeningSystemPrompt(rubrics: ScreeningRubrics): string {
  return `You are a systematic review expert tasked with screening a study based on its Title, Abstract, Year of Publication, and Journal, as provided at the end of this prompt. Follow the steps below.

- Step 1: Label the study as "NoAbstract" if the abstract is missing. Otherwise, follow Steps 2-4 below.
- Step 2: Include the study if it meets ANY of the "Inclusion Rules" listed below and record in "Rules Used" ALL of the "Inclusion Rules" that were applied to this study. Exclude the study if it meets none of the "Inclusion Rules" and record the "Rules Used" as "No RI applied".
- Step 3: For a study considered included in Step 2, further check the "Special Rules for Exclusion" and exclude it if any applies. At this step, only check the "Special Rules for Exclusion", and do not check the "Exclusion Rules".
- Step 4: For a study considered excluded in Step 2 or Step 3, identify which "Exclusion Rule(s)" were applied among (1) the "Exclusion Rules" listed below and (2) the "Special Rules for Exclusion" listed below, and replace "Rules Used" for this study with all identified "Exclusion Rule(s)".

Please provide:

Explanation: A step-by-step rationale for your decision.
Rules Used: Prefixes of the inclusion or exclusion rules applied.
Decision: Include, Exclude, NoAbstract

Do NOT generate anything apart from the labels for Decision. Always provide a Decision after the Explanation and Rules Used.

FORMAT:
Explanation: [Step-by-step explanation]
Rules Used: [Prefixes of inclusion or exclusion rules used for the decision, or "No RI applied" when applicable]
Decision: Include/Exclude/NoAbstract

${rubrics.definitions}

Inclusion Rules:

${rubrics.inclusionRules}

Exclusion Rules:

${rubrics.exclusionRules}

Special Rules of Exclusion:

${rubrics.specialRules}

List of a Psychometrician's Job:

${rubrics.psychometricianJobs}

ML Terms:

${rubrics.mlTerms}`;
}

/**
 * Build the user message for a single article
 */
export function buildArticlePrompt(
  title: string,
  abstract: string,
  year: string,
  journal: string
): string {
  return `Title: ${title}

Abstract: ${abstract || '[No abstract provided]'}

Year of Publication: ${year}

Journal: ${journal}`;
}

/**
 * Article input for batch screening
 */
export interface BatchArticleInput {
  index: number;
  id: string;
  title: string;
  abstract: string;
  year: string;
  journal: string;
}

/**
 * Default screening prompt template with placeholders for rubric content.
 * Placeholders: {{DEFINITIONS}}, {{INCLUSION_RULES}}, {{EXCLUSION_RULES}},
 * {{SPECIAL_RULES}}, {{PSYCHOMETRICIAN_JOBS}}, {{ML_TERMS}}
 */
export const DEFAULT_SCREENING_PROMPT_TEMPLATE = `You are a systematic review expert. You will screen multiple studies based on their Title, Abstract, Year, and Journal.

For EACH study, follow these steps:
- Step 1: Label as "NoAbstract" if abstract is missing/empty. Otherwise, continue.
- Step 2: Include if it meets ANY Inclusion Rule. Record ALL matching rules.
- Step 3: For included studies, check Special Rules for Exclusion - exclude if any applies.
- Step 4: For excluded studies, identify which Exclusion Rule(s) apply.

{{DEFINITIONS}}

=== INCLUSION RULES ===
{{INCLUSION_RULES}}

=== EXCLUSION RULES ===
{{EXCLUSION_RULES}}

=== SPECIAL RULES FOR EXCLUSION ===
{{SPECIAL_RULES}}

=== PSYCHOMETRICIAN'S JOB LIST ===
{{PSYCHOMETRICIAN_JOBS}}

=== ML TERMS ===
{{ML_TERMS}}

=== OUTPUT FORMAT ===
You MUST respond with valid JSON only. No markdown, no explanation outside JSON.
Return an array of screening results, one for each article in the exact order provided.

{
  "results": [
    {
      "index": 0,
      "decision": "Include|Exclude|NoAbstract",
      "rules_used": "RI1, RI3 or RE2, RE4 or NoAbstract or No RI applied",
      "explanation": "Brief 1-2 sentence rationale"
    }
  ]
}

CRITICAL RULES:
1. Return EXACTLY one result per article, in the same order as input
2. "decision" must be exactly "Include", "Exclude", or "NoAbstract"
3. "rules_used" should list rule prefixes (RI1, RE2, etc.) or "No RI applied" or "NoAbstract"
4. Keep explanations brief but informative
5. Output ONLY valid JSON, nothing else`;

/**
 * Build a screening system prompt by replacing template placeholders with rubric content.
 */
export function buildScreeningPromptFromTemplate(template: string, rubrics: ScreeningRubrics): string {
  return template
    .replace('{{DEFINITIONS}}', rubrics.definitions)
    .replace('{{INCLUSION_RULES}}', rubrics.inclusionRules)
    .replace('{{EXCLUSION_RULES}}', rubrics.exclusionRules)
    .replace('{{SPECIAL_RULES}}', rubrics.specialRules)
    .replace('{{PSYCHOMETRICIAN_JOBS}}', rubrics.psychometricianJobs)
    .replace('{{ML_TERMS}}', rubrics.mlTerms);
}

/**
 * Build the system prompt for batch screening (returns JSON)
 */
export function buildBatchScreeningSystemPrompt(rubrics: ScreeningRubrics): string {
  return buildScreeningPromptFromTemplate(DEFAULT_SCREENING_PROMPT_TEMPLATE, rubrics);
}

/**
 * Build the user message for batch screening
 */
export function buildBatchArticlesPrompt(articles: BatchArticleInput[]): string {
  const articleTexts = articles.map((article, idx) => {
    const abstractText = article.abstract?.trim()
      ? article.abstract
      : '[NO ABSTRACT]';

    return `=== ARTICLE ${idx} ===
Title: ${article.title || '[No title]'}
Abstract: ${abstractText}
Year: ${article.year || 'Unknown'}
Journal: ${article.journal || 'Unknown'}`;
  });

  return `Screen the following ${articles.length} articles:\n\n${articleTexts.join('\n\n')}`;
}
