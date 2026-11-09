// Indicative Google list prices, not ASU billing rates. Keep each version immutable.
// Standard/global text pricing, verified 2026-11-09; no cache/batch discounts.
const SOURCE = 'https://cloud.google.com/vertex-ai/generative-ai/pricing';
const VERSION = 'gemini-3.1-pro-standard-global-2026-11-09';

export function estimateRates(provider: string, model: string, input: number | null, output: number | null) {
  const unknown = {
    estimate_input_usd_per_million: null,
    estimate_output_usd_per_million: null,
    estimate_rate_version: null,
    estimate_rate_source: null,
  };
  if (provider !== 'gcp-deepmind' || model !== 'geminipro3_1' ||
      input === null || output === null || !Number.isSafeInteger(input) ||
      !Number.isSafeInteger(output) || input < 0 || output < 0) return unknown;

  // Both rates change when the input context exceeds 200k tokens.
  return {
    estimate_input_usd_per_million: input > 200_000 ? 4 : 2,
    estimate_output_usd_per_million: input > 200_000 ? 18 : 12,
    estimate_rate_version: VERSION,
    estimate_rate_source: SOURCE,
  };
}
