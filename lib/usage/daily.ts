import { usageFilters, type SearchParams } from './report';

export interface DailyUsage {
  day: string; request_count: number; active_users: number; attempt_count: number;
  requests_with_tokens: number; requests_with_accounted_cost: number;
  known_input_tokens: number | null; known_output_tokens: number | null;
  known_accounted_cost_usd: number | null;
}
export function dailyFilters(params: SearchParams, now = new Date()) {
  const filters = usageFilters(params, now);
  if (!filters.from || !filters.to || Date.parse(filters.to) - Date.parse(filters.from) > 365 * 86400000) {
    throw new Error('Choose a date range of at most 366 days.');
  }
  return { from: filters.from, to: filters.to };
}
