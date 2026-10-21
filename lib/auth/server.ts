import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { allowedRoutes, folderReaders, hasAccess, libraryFeature, projectForBot, type BotId } from './access';

export async function getAccount() {
  const supabase = await createSupabaseServerClient();
  // getUser validates with Supabase Auth; never trust getSession alone.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email) return null;
  const { data, error: accessError } = await supabase.from('user_bot_access')
    .select('bot_key').eq('user_id', user.id);
  if (accessError) throw new Error('Could not load account access');
  const [{ data: isAdmin, error: roleError }, { data: permissions, error: permissionError }] = await Promise.all([
    supabase.rpc('is_admin'),
    supabase.from('user_feature_access').select('project_name,code').eq('user_id', user.id),
  ]);
  if (roleError || permissionError) throw new Error('Could not load account permissions');
  return { user, isAdmin: isAdmin === true, permissions: permissions ?? [], grants: allowedRoutes((data ?? []).map(row => row.bot_key as string), isAdmin === true) };
}

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  // Non-browser API clients may omit Origin; browsers sending it must match.
  return !origin || origin === request.nextUrl.origin;
}

export async function requireApiAccess(request: NextRequest, bots: readonly BotId[]) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  try {
    const account = await getAccount();
    if (!account) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    if (!hasAccess(account.grants, bots)) {
      return NextResponse.json({ error: 'Access has not been granted for this operation' }, { status: 403 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: 'Authentication is temporarily unavailable' }, { status: 503 });
  }
}

export type Account = NonNullable<Awaited<ReturnType<typeof getAccount>>>;
export type FeatureCode = 'prompt_access' | 'permanent_upload' | 'nonmeasurement_library';

export function canUseFeature(account: Account, bots: readonly BotId[], feature: FeatureCode): boolean {
  if (feature === 'prompt_access' && !account.isAdmin) return false;
  return bots.some(bot => account.grants.includes(bot) && account.permissions.some(
    permission => permission.project_name === projectForBot(bot) && permission.code === feature));
}

export async function requireApiFeature(request: NextRequest, bots: readonly BotId[], feature: FeatureCode) {
  const denied = await requireApiAccess(request, bots);
  if (denied) return denied;
  try {
    const account = await getAccount();
    if (!account || !canUseFeature(account, bots, feature)) {
      return NextResponse.json({ error: 'This feature is not permitted for your account' }, { status: 403 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: 'Permission check unavailable' }, { status: 503 });
  }
}

export async function requireAdmin(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    const account = await getAccount();
    if (!account) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    if (!account.isAdmin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    return null;
  } catch {
    return NextResponse.json({ error: 'Permission check unavailable' }, { status: 503 });
  }
}

// A library is readable with access to one of its bots, plus its feature when it has one.
export function canReadLibrary(account: Account, folder: string): boolean {
  const bots = folderReaders(folder);
  const feature = libraryFeature(folder);
  return hasAccess(account.grants, bots) && (!feature || canUseFeature(account, bots, feature));
}

export async function requireApiLibrary(request: NextRequest, folder: string) {
  const feature = libraryFeature(folder);
  return feature ? requireApiFeature(request, folderReaders(folder), feature) : requireApiAccess(request, folderReaders(folder));
}
