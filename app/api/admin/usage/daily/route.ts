import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { dailyFilters } from '@/lib/usage/daily';

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const headers = { 'Cache-Control': 'private, no-store' };
  let filters;
  try {
    const params = request.nextUrl.searchParams;
    if (params.has('user') || params.getAll('from').length > 1 || params.getAll('to').length > 1) throw new Error();
    filters = dailyFilters({ from: params.get('from') ?? undefined, to: params.get('to') ?? undefined });
  } catch {
    return NextResponse.json({ error: 'Choose a valid date range of at most 366 days.' }, { status: 400, headers });
  }
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc('ai_usage_daily_totals', { p_from: filters.from, p_through: filters.to })
      .order('day').abortSignal(AbortSignal.timeout(15000));
    const expectedDays = (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000 + 1;
    if (error || !Array.isArray(data) || data.length !== expectedDays || data.some((row, index) =>
      row.day !== new Date(Date.parse(filters.from) + index * 86400000).toISOString().slice(0, 10))) throw new Error();
    return NextResponse.json({ filters, days: data }, { headers });
  } catch {
    return NextResponse.json({ error: 'Overall costs are temporarily unavailable. Please try again.' }, { status: 503, headers });
  }
}
