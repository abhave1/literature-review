import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../proxy';
import { BOT_ROUTES as BOTS, botForPath, safeNext, hasAccess, promptReaders, promptWriters, uploadWriters, folderReaders } from '../lib/auth/access';

test('every bot has a unique route and grant; aliases are explicit', () => {
  assert.equal(new Set(BOTS.map(bot => bot.id)).size, BOTS.length);
  assert.equal(new Set(BOTS.map(bot => bot.path)).size, BOTS.length);
  for (const bot of BOTS) assert.equal(botForPath(bot.path), bot.id);
  assert.equal(botForPath('/mxml'), 'mxml1');
  assert.equal(botForPath('/mxml4/'), 'mxml4');
  assert.equal(botForPath('/internal/anything'), undefined);
});

test('post-login redirects cannot escape to another origin or auth route', () => {
  for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth/login', '/login', '/mxml4?next=https://evil.example', null]) {
    assert.equal(safeNext(unsafe), '/bots');
  }
  assert.equal(safeNext('/internal/mxml4'), '/internal/mxml4');
  assert.equal(safeNext('/admin'), '/admin');
});

test('bot scope is separate from project feature permissions', () => {
  const grants = ['mxml4', 'mxml4-open'];
  assert.equal(hasAccess(grants, ['mxml4-internal']), false);
  assert.equal(hasAccess(grants, ['icap']), false);
  for (const mode of grants) {
    assert.equal(hasAccess(grants, promptReaders(mode)), true);
    assert.equal(hasAccess(grants, promptWriters(mode)), true);
  }
  for (const prefix of ['mxml-pdfs/', 'CSCL-lab/', '../config/']) {
    assert.equal(hasAccess(grants, uploadWriters(prefix)), false);
  }
  assert.equal(hasAccess(grants, uploadWriters('mxml4-measurement/')), true);
  assert.equal(hasAccess(['mxml4-internal'], uploadWriters('mxml4-measurement/')), true);
  assert.equal(hasAccess(grants, folderReaders('mxml4-measurement')), true);
  assert.equal(hasAccess(grants, folderReaders('icap')), false);
  assert.deepEqual(promptReaders('typo'), []);
  assert.deepEqual(folderReaders('typo'), []);
});

test('server gate validates sessions and current grants with Supabase', async t => {
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    assert.equal(url.origin, 'https://auth-test.supabase.co', 'Tests must never contact an external service');
    if (url.pathname === '/auth/v1/user') {
      if (revoked) return Response.json({ message: 'revoked', code: 'bad_jwt' }, { status: 401 });
      return Response.json({ id: 'test-user', email: 'approved@example.com', app_metadata: { provider: 'google' }, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() });
    }
    if (url.pathname === '/rest/v1/rpc/is_admin') return Response.json(admin);
    if (url.pathname === '/rest/v1/user_bot_access') {
      assert.equal(url.searchParams.get('user_id'), 'eq.test-user');
      assert.equal(url.searchParams.has('email'), false);
      if (dbUnavailable) return Response.json({ message: 'Unavailable' }, { status: 500 });
      const allowed = grants.includes(url.searchParams.get('bot_key')?.replace('eq.', '') ?? '');
      return Response.json(allowed ? { bot_key: grants[0] } : null);
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  });
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let admin = false;
  let revoked = false;
  let dbUnavailable = false;
  let grants = ['mxml4'];
  const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${jwtPart({ alg: 'HS256' })}.${jwtPart({ sub: 'test-user', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  const cookie = 'sb-auth-test-auth-token=base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'test-user' } })).toString('base64url');
  const request = (path: string, signedIn = false) => new NextRequest(`http://localhost:3000${path}`, { headers: signedIn ? { cookie } : {} });
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert.equal((await proxy(request('/api/analyze'))).status, 503);
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth-test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
    assert.equal((await proxy(request('/login'))).status, 200);
    assert.equal((await proxy(request('/home'))).status, 200);
    for (const bot of BOTS) {
      const result = await proxy(request(bot.path));
      assert.equal(result.status, 307);
      assert.equal(new URL(result.headers.get('location')!).pathname, '/login');
    }
    assert.equal((await proxy(request('/api/analyze'))).status, 401);
    assert.equal((await proxy(request('/mxml4', true))).status, 200);
    const denied = await proxy(request('/internal/mxml4', true));
    assert.equal(new URL(denied.headers.get('location')!).pathname, '/bots');
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    assert.equal(new URL((await proxy(request('/admin', true))).headers.get('location')!).pathname, '/bots');
    admin = true;
    assert.equal((await proxy(request('/admin', true))).status, 200);
    assert.equal((await proxy(request('/internal/mxml4', true))).status, 200);
    admin = false;
    grants = [];
    assert.equal(new URL((await proxy(request('/mxml4', true))).headers.get('location')!).pathname, '/bots');
    assert.equal((await proxy(request('/bots', true))).status, 200);
    dbUnavailable = true;
    assert.equal(new URL((await proxy(request('/mxml4', true))).headers.get('location')!).pathname, '/login');
    dbUnavailable = false;
    revoked = true;
    assert.equal((await proxy(request('/api/analyze', true))).status, 401);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
