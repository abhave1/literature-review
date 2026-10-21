import 'server-only';
export const CSCL_SCREENING_PROMPT_TEMPLATE = `You are a systematic review expert. You will screen multiple studies based on their Title, Abstract, Year, and Journal.

For EACH study, follow these steps:
- Step 1: Label as "NoAbstract" if abstract is missing/empty. Otherwise, continue.
- Step 2: Include if it meets ANY Inclusion Rule. Record ALL matching rules.
- Step 3: For included studies, further check the Exclusion Rules - exclude if any applies.
- Step 4: For excluded studies (excluded in Step 2 because no Inclusion Rule applied, or excluded in Step 3), identify which Exclusion Rule(s) were applied, and replace "Rules Used" with all identified Exclusion Rule(s).

{{DEFINITIONS}}

=== INCLUSION RULES ===
{{INCLUSION_RULES}}

=== EXCLUSION RULES ===
{{EXCLUSION_RULES}}

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

