import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isSameOrigin } from '@/lib/auth/server';

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse('Forbidden', { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) return NextResponse.json({ error: 'Could not sign out. Please retry.' }, { status: 503 });
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
