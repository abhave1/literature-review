// Run with: npm run test:prompts
// Real API handlers with Supabase stubbed: Non-measurement Journals is readable and writable only
// with the per-user library feature; Measurement Journals comes with the bot.
// No Blob token is set, so a request that passes authorization stops at 500 "not configured"
// before any storage call, and a refused one returns 403. Nothing leaves the machine.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${jwtPart({ alg: 'HS256' })}.${jwtPart({ sub: 'external-user', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const sessionCookie = { name: 'sb-auth-test-auth-token', value: 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'external-user' } })).toString('base64url') };

mock.module('next/headers', { namedExports: { cookies: async () => ({ getAll: () => [sessionCookie], set: () => {} }) } });

// Past authorization, the handler reaches its missing-token check.
const ALLOWED = 500;
let admin = false;
let features: { project_name: string; code: string }[] = [];
let bots = ['mxml4'];
test.beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable';
  delete process.env.BLOB_MXML_READ_WRITE_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN;
  admin = false; bots = ['mxml4']; features = [{ project_name: 'MxML', code: 'permanent_upload' }];
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    assert.equal(url.origin, 'https://auth-test.supabase.co', 'Tests must never contact an external service');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'external-user', email: 'external@example.edu', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() });
    if (url.pathname === '/rest/v1/rpc/is_admin') return Response.json(admin);
    if (url.pathname === '/rest/v1/user_bot_access') return Response.json(bots.map(bot_key => ({ bot_key })));
    if (url.pathname === '/rest/v1/user_feature_access') return Response.json(features);
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
});
test.afterEach(() => mock.restoreAll());

const get = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const upload = (prefix: string) => {
  const form = new FormData();
  form.set('prefix', prefix);
  form.append('files', new File(['%PDF-1.4'], 'paper.pdf', { type: 'application/pdf' }));
  return new NextRequest('http://localhost:3000/api/upload-to-blob', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: form });
};

test('without the grant, an external user gets Measurement only', async () => {
  const files = await import('../app/api/mxml-files/route');
  const uploads = await import('../app/api/upload-to-blob/route');
  const capabilities = await import('../app/api/capabilities/route');
  assert.equal((await files.GET(get('/api/mxml-files?folder=mxml4-measurement'))).status, ALLOWED);
  assert.equal((await files.GET(get('/api/mxml-files?folder=mxml4-nonmeasurement'))).status, 403);
  assert.equal((await uploads.POST(upload('mxml4-measurement/'))).status, ALLOWED);
  assert.equal((await uploads.POST(upload('mxml4-nonmeasurement/'))).status, 403);
  assert.deepEqual((await (await capabilities.GET(get('/api/capabilities?bot=mxml4'))).json()).libraries, ['mxml4-measurement']);
});

test('granting the library opens list and upload for that user', async () => {
  features.push({ project_name: 'MxML', code: 'nonmeasurement_library' });
  const files = await import('../app/api/mxml-files/route');
  const uploads = await import('../app/api/upload-to-blob/route');
  const capabilities = await import('../app/api/capabilities/route');
  assert.equal((await files.GET(get('/api/mxml-files?folder=mxml4-nonmeasurement'))).status, ALLOWED);
  assert.equal((await uploads.POST(upload('mxml4-nonmeasurement/'))).status, ALLOWED);
  assert.deepEqual((await (await capabilities.GET(get('/api/capabilities?bot=mxml4'))).json()).libraries, ['mxml4-measurement', 'mxml4-nonmeasurement']);
});

test('a library feature granted in another project does not leak into MxML', async () => {
  features.push({ project_name: 'CSCL', code: 'nonmeasurement_library' });
  const files = await import('../app/api/mxml-files/route');
  assert.equal((await files.GET(get('/api/mxml-files?folder=mxml4-nonmeasurement'))).status, 403);
});

test('other libraries keep their existing upload rules', async () => {
  bots = ['mxml1', 'cscl-close'];
  features = [{ project_name: 'MxML', code: 'permanent_upload' }, { project_name: 'CSCL', code: 'permanent_upload' }];
  const uploads = await import('../app/api/upload-to-blob/route');
  assert.equal((await uploads.POST(upload('mxml-pdfs/'))).status, ALLOWED);
  assert.equal((await uploads.POST(upload('CSCL-lab/'))).status, ALLOWED);
  assert.equal((await uploads.POST(upload('mxml4-measurement/'))).status, 403, 'no MxML4 bot, no MxML4 upload');
});
