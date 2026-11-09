import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${jwtPart({ alg: 'HS256' })}.${jwtPart({ sub: 'verified-user', exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
const cookie = { name: 'sb-auth-test-auth-token', value: 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'verified-user' } })).toString('base64url') };
mock.module('next/headers', { namedExports: { cookies: async () => ({ getAll: () => [cookie], set: () => {} }) } });
mock.module('@vercel/blob', { namedExports: { list: async () => ({ blobs: [] }) } });
let loggedIn = true;
let ledgerAvailable = true;
let modelCalls = 0;
const rows: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
test.beforeEach(() => {
  loggedIn = true; ledgerAvailable = true; modelCalls = 0; rows.length = 0; updates.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'fake-publishable';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service';
  process.env.ASU_AIML_TOKEN = 'fake-model-token';
  process.env.ASU_AIML_BASE_URL = 'https://model-test.invalid';
  delete process.env.BLOB_MXML_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    if (url.origin === 'https://model-test.invalid') {
      modelCalls++;
      return Response.json({ response: '[]', metadata: { usage_metric: { input_token_count: 10, output_token_count: 2, total_token_cost: 0.001 } } });
    }
    assert.equal(url.origin, 'https://auth-test.supabase.co', 'No external services in tests');
    if (url.pathname === '/auth/v1/user') return loggedIn ? Response.json({ id: 'verified-user', email: 'user@example.edu', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() }) : Response.json({ message: 'not signed in' }, { status: 401 });
    if (url.pathname === '/rest/v1/rpc/is_admin') return Response.json(false);
    if (url.pathname === '/rest/v1/user_bot_access') return Response.json([{ bot_key: 'mxml4' }, { bot_key: 'screening' }]);
    if (url.pathname === '/rest/v1/user_feature_access') return Response.json([]);
    if (url.pathname === '/rest/v1/ai_usage_ledger') {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer fake-service');
      if (!ledgerAvailable) return Response.json({ message: 'missing table' }, { status: 404 });
      const payload = JSON.parse(init?.body as string);
      if (init?.method === 'POST') { rows.push(payload); return new Response(null, { status: 201 }); }
      assert.equal(init?.method, 'PATCH');
      assert.equal(url.searchParams.get('status'), 'eq.pending');
      updates.push(payload);
      return Response.json([{ id: url.searchParams.get('id')?.slice(3) }]);
    }
    throw new Error(`Unexpected path ${url.pathname}`);
  });
});
test.afterEach(() => mock.restoreAll());
const call = (path: string, body: object) => new NextRequest(`http://localhost:3000${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: JSON.stringify(body) });
const file = { fileName: 'paper.pdf', text: 'some research text', extractionSuccess: true };

test('analysis attributes two files to verified user and one server-generated request, ignoring spoofed IDs', async () => {
  const { POST } = await import('../app/api/analyze/route');
  const response = await POST(call('/api/analyze', { botId: 'mxml4', user_id: 'victim', userId: 'victim', request_id: 'spoofed', files: [file, file] }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).successCount, 2);
  assert.equal(rows.length, 2); assert.equal(updates.length, 2);
  assert.equal(rows[0].user_id, 'verified-user');
  assert.equal(rows[1].user_id, 'verified-user');
  assert.equal(rows[0].request_id, rows[1].request_id);
  assert.notEqual(rows[0].request_id, 'spoofed');
  assert.notEqual(rows[0].call_id, rows[1].call_id);
  assert.equal(updates[0].input_tokens, 10);
  assert.equal(updates[1].output_tokens, 2);
  assert.equal(updates[0].estimate_input_usd_per_million, 2);
  assert.equal(updates[0].estimate_output_usd_per_million, 12);
  assert.equal(updates[0].cost_usd, 0.001);
});
test('screening records provider usage even when response parsing fails; no-abstract batches do not call model', async () => {
  const { POST } = await import('../app/api/screening/route');
  const article = { id: 'a', title: 'paper', abstract: 'A sufficiently detailed research abstract discussing educational measurements and machine learning techniques.', year: '2026', journal: 'Journal' };
  await POST(call('/api/screening', { botId: 'screening', articles: [article], rubrics: {} }));
  assert.equal(modelCalls, 1); assert.equal(rows.length, 1);
  assert.equal(rows[0].operation, 'screening'); assert.equal(rows[0].user_id, 'verified-user');
  assert.equal(updates[0].status, 'succeeded'); assert.equal(updates[0].input_tokens, 10);
  assert.equal(updates[0].estimate_input_usd_per_million, 2);
  assert.ok(updates[0].estimate_rate_version);
  await POST(call('/api/screening', { botId: 'screening', articles: [{ ...article, abstract: '' }], rubrics: {} }));
  assert.equal(modelCalls, 1); assert.equal(rows.length, 1);
});
test('unauthenticated and unauthorized requests create neither model calls nor ledger rows', async () => {
  const analyze = await import('../app/api/analyze/route');
  const screening = await import('../app/api/screening/route');
  loggedIn = false;
  assert.equal((await analyze.POST(call('/api/analyze', { botId: 'mxml4', files: [file] }))).status, 401);
  assert.equal((await screening.POST(call('/api/screening', { botId: 'screening', articles: [] }))).status, 401);
  loggedIn = true;
  assert.equal((await analyze.POST(call('/api/analyze', { botId: 'icap', files: [file] }))).status, 403);
  assert.equal(rows.length, 0); assert.equal(modelCalls, 0);
});
test('missing migration fails closed before spending tokens', async () => {
  ledgerAvailable = false;
  const { POST } = await import('../app/api/analyze/route');
  const response = await POST(call('/api/analyze', { botId: 'mxml4', files: [file] }));
  assert.equal((await response.json()).successCount, 0);
  assert.equal(modelCalls, 0);
});
