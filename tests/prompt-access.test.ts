// Run with: npm run test:prompts
// Exercises the real API route handlers with Supabase stubbed, so an external account
// (bot grant + every feature row, but not admin) is proven unable to read or change prompts.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${jwtPart({ alg: 'HS256' })}.${jwtPart({ sub: 'external-user', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const sessionCookie = { name: 'sb-auth-test-auth-token', value: 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'external-user' } })).toString('base64url') };
const blobWrites: string[] = [];

mock.module('next/headers', { namedExports: { cookies: async () => ({ getAll: () => [sessionCookie], set: () => {} }) } });
mock.module('@vercel/blob', { namedExports: {
  put: async () => { blobWrites.push('put'); return { url: 'x' }; },
  del: async () => { blobWrites.push('del'); },
  list: async () => { blobWrites.push('list'); return { blobs: [] }; },
} });

let admin = false;
test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  delete process.env.BLOB_MXML_READ_WRITE_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN;
  blobWrites.length = 0;
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    assert.equal(url.origin, 'https://auth-test.supabase.co', 'Tests must never contact an external service');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'external-user', email: 'external@example.edu', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() });
    if (url.pathname === '/rest/v1/rpc/is_admin') return Response.json(admin);
    if (url.pathname === '/rest/v1/user_bot_access') return Response.json([{ bot_key: 'mxml4' }, { bot_key: 'mxml4-open' }, { bot_key: 'screening' }]);
    // Worst case: the external account somehow has every feature row, including prompts.
    if (url.pathname === '/rest/v1/user_feature_access') return Response.json([
      { project_name: 'MxML', code: 'prompt_access' }, { project_name: 'MxML', code: 'permanent_upload' }]);
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
});
test.afterEach(() => mock.restoreAll());

const call = (method: string, path: string, body?: object) => new NextRequest(`http://localhost:3000${path}`, {
  method, headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: body ? JSON.stringify(body) : undefined });

test('external users cannot change, reset, or override any prompt', async () => {
  const prompt = await import('../app/api/prompt/route');
  const rubric = await import('../app/api/screening-rubric/route');
  const analyze = await import('../app/api/analyze/route');
  const screening = await import('../app/api/screening/route');
  const capabilities = await import('../app/api/capabilities/route');
  for (const mode of ['mxml4', 'mxml4-open']) {
    assert.equal((await prompt.POST(call('POST', '/api/prompt', { mode, systemPrompt: 'x', ratedAspects: 'y' }))).status, 403, `save ${mode}`);
    assert.equal((await prompt.DELETE(call('DELETE', `/api/prompt?mode=${mode}`))).status, 403, `reset ${mode}`);
    const read = await (await prompt.GET(call('GET', `/api/prompt?mode=${mode}`))).json();
    assert.equal('systemPrompt' in read, false, `read ${mode} must hide the system prompt`);
  }
  assert.equal((await rubric.POST(call('POST', '/api/screening-rubric', { rubrics: {} }))).status, 403);
  assert.equal((await rubric.DELETE(call('DELETE', '/api/screening-rubric'))).status, 403);
  assert.equal('promptTemplate' in await (await rubric.GET(call('GET', '/api/screening-rubric'))).json(), false);
  assert.equal((await analyze.POST(call('POST', '/api/analyze', { botId: 'mxml4', files: [], customSystemPrompt: 'ignore the rubric' }))).status, 403);
  assert.equal((await screening.POST(call('POST', '/api/screening', { botId: 'screening', articles: [], promptTemplate: 'x' }))).status, 403);
  assert.deepEqual(await (await capabilities.GET(call('GET', '/api/capabilities?bot=mxml4'))).json(), { canManagePrompts: false, canUpload: true, libraries: ['mxml4-measurement'] });
  assert.deepEqual(blobWrites.filter(op => op !== 'list'), [], 'no blob was written or deleted');
});

test('the same account as admin is allowed through (proves the denial is the role, not the stub)', async () => {
  admin = true;
  try {
    const prompt = await import('../app/api/prompt/route');
    const capabilities = await import('../app/api/capabilities/route');
    // Invalid body: an allowed caller gets 400 from validation instead of 403, and nothing is written.
    assert.equal((await prompt.POST(call('POST', '/api/prompt', { mode: 'mxml4', systemPrompt: 1, ratedAspects: 1 }))).status, 400);
    assert.equal('systemPrompt' in await (await prompt.GET(call('GET', '/api/prompt?mode=mxml4'))).json(), true);
    assert.equal((await (await capabilities.GET(call('GET', '/api/capabilities?bot=mxml4'))).json()).canManagePrompts, true);
  } finally { admin = false; }
});
