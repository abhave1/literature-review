import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { usageFilters, reportBounds, REQUEST_LIMIT } from '@/lib/usage/report';

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const headers = { 'Cache-Control': 'private, no-store' };
  let filters;
  try {
    const values = request.nextUrl.searchParams.getAll('user');
    if (values.length !== 1 || !values[0]) throw new Error();
    const params = request.nextUrl.searchParams;
    for (const key of ['from', 'to', 'page']) if (params.getAll(key).length > 1) throw new Error();
    filters = usageFilters({ user: values[0], from: params.get('from') ?? '', to: params.get('to') ?? '', page: params.get('page') ?? '1' });
  } catch {
    return NextResponse.json({ error: 'Choose a valid user, date range, and page.' }, { status: 400, headers });
  }
  try {
    // Keep the admin's session: ledger RLS is a second authorization layer.
    const db = await createSupabaseServerClient();
    const { user, page } = filters;
    const bounds = reportBounds(filters);
    const offset = (page - 1) * REQUEST_LIMIT;
    const [totals, details] = await Promise.all([
      db.rpc('ai_usage_user_totals', bounds).eq('user_id', user).abortSignal(AbortSignal.timeout(15000)),
      db.rpc('ai_usage_request_totals', bounds).eq('user_id', user)
        .order('started_at', { ascending: false }).order('request_id')
        .range(offset, offset + REQUEST_LIMIT).abortSignal(AbortSignal.timeout(15000)),
    ]);
    if (totals.error || details.error || !Array.isArray(totals.data) || !Array.isArray(details.data) ||
        totals.data.length > 1 || [...totals.data, ...details.data].some(row => row.user_id !== user)) throw new Error();
    return NextResponse.json({
      userId: user, usage: totals.data[0] ?? null,
      requests: details.data.slice(0, REQUEST_LIMIT), hasMoreRequests: details.data.length > REQUEST_LIMIT,
    }, { headers });
  } catch {
    return NextResponse.json({ error: 'Could not load usage. Please try again.' }, { status: 503, headers });
  }
}
