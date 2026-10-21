import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/auth/access';
import { isSameOrigin } from '@/lib/auth/server';

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse('Forbidden', { status: 403 });
  try {
    const form = await request.formData();
    const callback = new URL('/auth/callback', request.url);
    callback.searchParams.set('next', safeNext(form.get('next')));
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString(), queryParams: { prompt: 'select_account' } },
    });
    if (!error && data.url) return NextResponse.redirect(data.url, 303);
  } catch { /* Fail closed with a retryable login screen. */ }
  return NextResponse.redirect(new URL('/login?error=oauth', request.url), 303);
}
