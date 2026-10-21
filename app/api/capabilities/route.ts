import { NextRequest, NextResponse } from 'next/server';
import { BOT_ROUTES, LIBRARIES, type BotId } from '@/lib/auth/access';
import { getAccount, canReadLibrary, canUseFeature } from '@/lib/auth/server';

export async function GET(request: NextRequest) {
  const bot = request.nextUrl.searchParams.get('bot') as BotId;
  if (!BOT_ROUTES.some(item => item.id === bot)) return NextResponse.json({ error: 'Unknown bot' }, { status: 400 });
  try {
    const account = await getAccount();
    if (!account) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    if (!account.grants.includes(bot)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    return NextResponse.json({
      canManagePrompts: canUseFeature(account, [bot], 'prompt_access'),
      canUpload: canUseFeature(account, [bot], 'permanent_upload'),
      libraries: LIBRARIES.filter(folder => canReadLibrary(account, folder)),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Permission check unavailable' }, { status: 503 });
  }
}
