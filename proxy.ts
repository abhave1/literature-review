import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { botForPath, canonicalBotId, isInternalRoute } from '@/lib/auth/access';
import { supabaseConfig } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Exact public routes only. All other pages AND APIs fail closed.
  if (['/login', '/auth/login', '/auth/callback', '/auth/signout'].includes(path)) {
    return NextResponse.next();
  }
  const api = path.startsWith('/api/');
  const config = supabaseConfig();
  let response = NextResponse.next({ request });
  const finish = (result: NextResponse) => {
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  };
  const deny = (status: number, message: string, destination: string) => {
    if (api) return finish(NextResponse.json({ error: message }, { status }));
    const url = new URL(destination, request.url);
    if (destination === '/login') url.searchParams.set('next', path);
    return finish(NextResponse.redirect(url));
  };
  if (!config) return deny(503, 'Authentication is not configured', '/login');
  try {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return deny(401, 'Sign in required', '/login');
    // APIs perform resource-specific authorization inside each handler as well.
    if (api || path === '/bots' || path === '/access-required') return finish(response);
    if (path === '/admin') {
      const { data: admin, error: adminError } = await supabase.rpc('is_admin');
      if (adminError || admin !== true) return deny(403, 'Admin required', '/bots?denied=1');
      return finish(response);
    }
    const bot = botForPath(path);
    if (!bot) return deny(403, 'Access denied', '/bots?denied=1');
    if (isInternalRoute(bot)) {
      const { data: admin, error: adminError } = await supabase.rpc('is_admin');
      if (adminError || admin !== true) return deny(403, 'Admin required', '/bots?denied=1');
    }
    const { data, error: accessError } = await supabase.from('user_bot_access')
      .select('bot_key').eq('user_id', user.id).eq('bot_key', canonicalBotId(bot)).maybeSingle();
    if (accessError) return deny(503, 'Access check unavailable', '/login?error=unavailable');
    if (!data) return deny(403, 'Access not granted', '/bots?denied=1');
    return finish(response);
  } catch {
    return deny(503, 'Authentication unavailable', '/login?error=unavailable');
  }
}

export const config = {
  matcher: ['/((?!_next/static/|_next/image$|favicon.ico$|window.svg$|globe.svg$|next.svg$|vercel.svg$|file.svg$|load-pdf-parse.js$).*)'],
};
