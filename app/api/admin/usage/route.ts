import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { usageFilters } from '@/lib/usage/report';

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const headers = { 'Cache-Control': 'private, no-store' };
  let user: string;
  try {
    const values = request.nextUrl.searchParams.getAll('user');
    if (values.length !== 1 || !values[0]) throw new Error();
    user = usageFilters({ user: values[0] }).user;
  } catch {
    return NextResponse.json({ error: 'Choose a valid user.' }, { status: 400, headers });
  }
  try {
    // Keep the admin's session: ledger RLS is a second authorization layer.
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc('ai_usage_user_totals', { p_from: '-infinity', p_to: 'infinity' })
      .eq('user_id', user).abortSignal(AbortSignal.timeout(15000));
    if (error || !Array.isArray(data) || data.length > 1 || data.some(row => row.user_id !== user)) throw new Error();
    return NextResponse.json({ userId: user, usage: data[0] ?? null }, { headers });
  } catch {
    return NextResponse.json({ error: 'Could not load usage. Please try again.' }, { status: 503, headers });
  }
}
