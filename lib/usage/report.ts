export type SearchParams = Record<string, string | string[] | undefined>;
export interface UsageFilters { from: string; to: string; user: string; page: number }
export const USER_PAGE_SIZE = 100;
export const REQUEST_LIMIT = 50;

// Dates in the UI are inclusive UTC calendar days. Empty bounds mean all history.
export function usageFilters(params: SearchParams, now = new Date()): UsageFilters {
  const scalar = (name: string, fallback = '') => {
    const value = params[name];
    if (Array.isArray(value)) throw new Error('Use one value per filter.');
    return value ?? fallback;
  };
  const today = now.toISOString().slice(0, 10);
  const from = scalar('from', today.slice(0, 8) + '01');
  const to = scalar('to', today);
  for (const value of [from, to]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '9998-12-31' ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
      throw new Error('Enter valid dates from 2000 through 9998.');
    }
  }
  if (from && to && from > to) throw new Error('The start date must be on or before the end date.');
  const user = scalar('user');
  if (user && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user)) throw new Error('Invalid user filter.');
  const pageText = scalar('page', '1');
  if (!/^[1-9]\d*$/.test(pageText) || Number(pageText) > 10000) throw new Error('Invalid page.');
  return { from, to, user, page: Number(pageText) };
}

export function reportBounds(filters: UsageFilters) {
  return {
    p_from: filters.from ? `${filters.from}T00:00:00.000Z` : '-infinity',
    p_to: filters.to ? new Date(Date.parse(filters.to) + 86400000).toISOString() : 'infinity',
  };
}

export function usageUrl(filters: UsageFilters, changes: Partial<UsageFilters> = {}) {
  const f = { ...filters, ...changes };
  const params = new URLSearchParams({ tab: 'usage', from: f.from, to: f.to, page: String(f.page) });
  if (f.user) params.set('user', f.user);
  return `/admin?${params}`;
}

export interface UserUsage {
  user_id: string; email: string | null; request_count: number; attempt_count: number;
  requests_with_tokens: number; requests_with_estimates: number; requests_with_accounted_cost: number;
  avg_input_tokens_per_request: number | null; avg_output_tokens_per_request: number | null;
  avg_estimated_usd_per_request: number | null; avg_accounted_usd_per_request: number | null;
  known_accounted_cost_usd: number | null;
}
export interface RequestUsage {
  user_id: string; request_id: string; started_at: string; call_count: number; attempt_count: number;
  pending_attempts: number; unknown_token_attempts: number; unknown_cost_attempts: number;
  input_tokens: number | null; output_tokens: number | null;
  provider_cost_usd: number | null; estimated_cost_usd: number | null; accounted_cost_usd: number | null;
}
export interface UsageReport {
  filters: UsageFilters; users: UserUsage[]; hasMoreUsers: boolean;
  requests: RequestUsage[]; hasMoreRequests: boolean; selectedEmail: string | null;
}
