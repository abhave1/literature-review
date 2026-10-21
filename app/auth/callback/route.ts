import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/access';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (code && !request.nextUrl.searchParams.has('error')) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get('next')), request.url));
    } catch { /* Invalid/expired codes cannot establish a session. */ }
  }
  return NextResponse.redirect(new URL('/login?error=callback', request.url));
}
