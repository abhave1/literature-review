// Real Next.js HTTP requests against a local Supabase protocol fixture.
// No Google, Supabase, AI, or storage service is contacted.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { BOT_ROUTES as BOTS } from '../lib/auth/access';

const grants: Record<string, string[]> = {
  external: ['mxml4', 'mxml4-open'],
  internal: ['mxml4', 'mxml4-open'],
  unapproved: [],
};
const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
function cookieFor(account: string) {
  const token = `${part({ alg: 'HS256' })}.${part({ sub: account, exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
  return `sb-127-auth-token=base64-${part({ access_token: token, refresh_token: 'fixture', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: account } })}`;
}
let unexpectedRequests = 0;
const fixture = createServer((req, res) => {
  const url = new URL(req.url!, 'http://localhost');
  let account = '';
  try { account = JSON.parse(Buffer.from(req.headers.authorization!.split('.')[1], 'base64url').toString()).sub; } catch { /* unauthenticated */ }
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/auth/v1/user' && grants[account]) {
    res.end(JSON.stringify({ id: account, email: `${account}@example.com`, app_metadata: { provider: 'google' }, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() }));
  } else if (url.pathname === '/auth/v1/user') {
    res.writeHead(401).end(JSON.stringify({ message: 'Session revoked', code: 'bad_jwt' }));
  } else if (url.pathname === '/rest/v1/user_bot_access') {
    assert.equal(url.searchParams.get('user_id'), `eq.${account}`);
    const requested = url.searchParams.get('bot_key')?.replace('eq.', '');
    const rows = (grants[account] ?? []).filter(bot => !requested || requested === bot).map(bot_key => ({ bot_key }));
    const single = req.headers.accept?.includes('application/vnd.pgrst.object+json');
    res.end(JSON.stringify(single ? rows[0] ?? null : rows));
  } else if (url.pathname === '/rest/v1/rpc/is_admin') {
    res.end(JSON.stringify(account === 'internal'));
  } else if (url.pathname === '/rest/v1/user_feature_access') {
    res.end(JSON.stringify(account === 'internal' ? [{ project_name: 'MxML', code: 'prompt_access' }, { project_name: 'MxML', code: 'permanent_upload' }] : []));
  } else if (url.pathname === '/auth/v1/token') {
    res.writeHead(400).end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid test code' }));
  } else {
    unexpectedRequests++;
    res.writeHead(500).end(JSON.stringify({ error: 'Unexpected fixture request' }));
  }
});

async function main() {
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  const address = fixture.address();
  assert(address && typeof address !== 'string');
  const appPort = Number(process.env.AUTH_TEST_PORT || 3197);
  const origin = `http://127.0.0.1:${appPort}`;
  let logs = '';
  const testEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key',
    ASU_AIML_TOKEN: '', BLOB_READ_WRITE_TOKEN: '', BLOB_MXML_READ_WRITE_TOKEN: '',
  };
  // Next inlines NEXT_PUBLIC_* at build time. Build with fixture values so a
  // configured .env.local cannot redirect tests to the real Supabase project.
  const build = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    env: testEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  build.stdout.on('data', chunk => { logs += chunk; });
  build.stderr.on('data', chunk => { logs += chunk; });
  const [buildCode] = await once(build, 'exit');
  assert.equal(buildCode, 0, logs);
  const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(appPort)], {
    env: testEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', chunk => { logs += chunk; });
  app.stderr.on('data', chunk => { logs += chunk; });
  let checks = 0;
  async function check(path: string, expectedStatus: number, account?: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (account) headers.set('cookie', cookieFor(account));
    const response = await fetch(`${origin}${path}`, { ...init, headers, redirect: 'manual' });
    assert.equal(response.status, expectedStatus, `${init.method || 'GET'} ${path}: ${await response.clone().text()}`);
    checks++;
    return response;
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (app.exitCode !== null) throw new Error(logs);
      try { await fetch(`${origin}/login`); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(ready, logs);
    const login = await check('/login', 200);
    assert.match(await login.text(), /Continue with Google/);
    for (const bot of BOTS) {
      const response = await check(bot.path, 307);
      assert.equal(new URL(response.headers.get('location')!, origin).pathname, '/login');
    }
    await check('/api/analyze', 401, undefined, { method: 'POST', body: '{}' });
    await check('/api/upload-to-blob', 401, undefined, { method: 'POST' });
    await check('/api/validate-key', 401, undefined, { method: 'POST', body: '{"key":"legacy-key"}' });
    const external = await check('/mxml4', 200, 'external');
    assert.match(await external.text(), /One-time analysis/);
    assert.doesNotMatch(await (await check('/mxml4-open', 200, 'external')).text(), /Upload to .*\(Permanent\)/);
    const internal = await check('/internal/mxml4', 200, 'internal');
    assert.match(await internal.text(), /Internal research workspace/);
    const restricted = await check('/internal/mxml4', 307, 'external');
    assert.equal(new URL(restricted.headers.get('location')!, origin).pathname, '/bots');
    await check('/mxml4', 307, 'unapproved');
    await check('/mxml4', 307, 'revoked');
    const bots = await check('/bots', 200, 'external');
    const botHtml = await bots.text();
    assert.match(botHtml, /MxML4 Yes\/No/);
    assert.doesNotMatch(botHtml, /href="\/internal/);
    await check('/api/upload-to-blob', 403, 'external', { method: 'POST' });
    await check('/api/prompt', 403, 'external', { method: 'POST', body: JSON.stringify({ mode: 'mxml4', systemPrompt: 'forged', ratedAspects: 'forged' }) });
    await check('/api/prompt?mode=mxml4', 403, 'external', { method: 'DELETE' });
    await check('/api/prompt?mode=mxml4-internal', 403, 'external');
    const promptConfig = await (await check('/api/prompt?mode=mxml4', 200, 'external')).json();
    assert.equal('systemPrompt' in promptConfig, false);
    assert.equal(typeof promptConfig.ratedAspects, 'string');
    await check('/api/analyze', 403, 'external', { method: 'POST', body: JSON.stringify({ botId: 'mxml4', customSystemPrompt: 'forged', files: [] }) });
    await check('/admin', 307, 'external');
    await check('/api/admin/access', 403, 'external');
    await check('/api/admin/access', 403, 'external', { method: 'POST', body: '{}' });
    const capabilities = await (await check('/api/capabilities?bot=mxml4', 200, 'external')).json();
    assert.deepEqual(capabilities, { canManagePrompts: false, canUpload: false });
    await check('/api/mxml-files?folder=icap', 403, 'external');
    await check('/api/screening', 403, 'external', { method: 'POST' });
    await check('/api/drive/sync', 403, 'external', { method: 'POST' });
    await check('/api/analyze', 403, 'external', { method: 'POST', body: JSON.stringify({ botId: 'icap', files: [] }) });
    await check('/api/analyze', 400, 'external', { method: 'POST', body: JSON.stringify({ botId: 'mxml4', files: [] }) });
    await check('/api/analyze', 403, 'external', { method: 'POST', headers: { origin: 'https://evil.example' }, body: JSON.stringify({ botId: 'mxml4', files: [] }) });
    await check('/auth/login', 403, undefined, { method: 'POST', headers: { origin: 'https://evil.example' } });
    await check('/auth/signout', 403, 'external', { method: 'POST', headers: { origin: 'https://evil.example' } });
    const oauth = await check('/auth/login', 303, undefined, { method: 'POST', body: new URLSearchParams({ next: '//evil.example' }) });
    const authorize = new URL(oauth.headers.get('location')!, origin);
    assert.equal(authorize.searchParams.get('provider'), 'google');
    assert.equal(new URL(authorize.searchParams.get('redirect_to')!).searchParams.get('next'), '/bots');
    assert.match(oauth.headers.get('set-cookie')!, /code-verifier/);
    const callback = await check('/auth/callback?code=invalid', 307);
    assert.equal(new URL(callback.headers.get('location')!, origin).pathname, '/login');
    assert.equal(unexpectedRequests, 0);
    console.log(`PASS: ${checks} HTTP checks against the production build; all auth traffic used a local fixture.`);
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    app.kill('SIGTERM');
    await once(app, 'exit');
    fixture.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; fixture.close(); });
