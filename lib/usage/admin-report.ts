import 'server-only';
import { getAccount } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdminSnapshot } from '@/lib/auth/admin-types';
import { usageFilters, reportBounds, USER_PAGE_SIZE, REQUEST_LIMIT, type SearchParams, type UserUsage, type RequestUsage, type UsageReport } from './report';

type Result = { kind: 'signed-out' | 'forbidden' | 'unavailable' } |
  { kind: 'invalid'; message: string } | { kind: 'ready'; report: UsageReport };

export async function loadAdminUsage(params: SearchParams): Promise<Result> {
  // Authorize before loading identities or any usage, even when called without the proxy.
  let account;
  try { account = await getAccount(); } catch { return { kind: 'unavailable' }; }
  if (!account) return { kind: 'signed-out' };
  if (!account.isAdmin) return { kind: 'forbidden' };
  let filters;
  try { filters = usageFilters(params); }
  catch (error) { return { kind: 'invalid', message: (error as Error).message }; }
  try {
    // Use the caller's session so database RLS remains a second authorization layer.
    const db = await createSupabaseServerClient();
    const bounds = reportBounds(filters);
    const offset = (filters.page - 1) * USER_PAGE_SIZE;
    const [totals, identities, details] = await Promise.all([
      db.rpc('ai_usage_user_totals', bounds).order('user_id').range(offset, offset + USER_PAGE_SIZE).abortSignal(AbortSignal.timeout(15000)),
      db.rpc('admin_access_snapshot').abortSignal(AbortSignal.timeout(15000)),
      filters.user ? db.rpc('ai_usage_request_totals', bounds).eq('user_id', filters.user)
        .order('started_at', { ascending: false }).order('request_id').limit(REQUEST_LIMIT + 1).abortSignal(AbortSignal.timeout(15000))
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (totals.error || identities.error || details.error || !Array.isArray(totals.data) ||
        !Array.isArray(identities.data?.users) || !Array.isArray(details.data)) return { kind: 'unavailable' };
    const people = (identities.data as AdminSnapshot).users;
    const emails = new Map(people.map(user => [user.id, user.email]));
    return { kind: 'ready', report: {
      filters, hasMoreUsers: totals.data.length > USER_PAGE_SIZE,
      users: (totals.data as Omit<UserUsage, 'email'>[]).slice(0, USER_PAGE_SIZE).map(row => ({ ...row, email: emails.get(row.user_id) ?? null })),
      requests: (details.data as RequestUsage[]).slice(0, REQUEST_LIMIT),
      hasMoreRequests: details.data.length > REQUEST_LIMIT,
      selectedEmail: emails.get(filters.user) ?? null,
    } };
  } catch { return { kind: 'unavailable' }; }
}
