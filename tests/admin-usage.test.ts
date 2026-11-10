import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { usageFilters, reportBounds, usageUrl } from '../lib/usage/report';

const userId = '00000000-0000-0000-0000-000000000001';
const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${jwtPart({ alg: 'HS256' })}.${jwtPart({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
const cookie = { name: 'sb-auth-test-auth-token', value: 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userId } })).toString('base64url') };
mock.module('next/headers', { namedExports: { cookies: async () => ({ getAll: () => [cookie], set: () => {} }) } });
let loadAdminUsage: typeof import('../lib/usage/admin-report').loadAdminUsage;
test.before(async () => { ({ loadAdminUsage } = await import('../lib/usage/admin-report')); });
let loggedIn = true, admin = true, unavailable = false, reportCalls = 0;
let totals: object[] = [];
const requests: { url: URL; body: Record<string, unknown> }[] = [];
test.beforeEach(() => {
  loggedIn = true; admin = true; unavailable = false; reportCalls = 0; totals = []; requests.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://auth-test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'fake-publishable';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'must-not-use-service-key';
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    assert.equal(url.origin, 'https://auth-test.supabase.co', 'Tests cannot reach external services');
    if (url.pathname === '/auth/v1/user') return loggedIn ? Response.json({ id: userId, email: 'admin@example.edu', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }) : Response.json({ message: 'signed out' }, { status: 401 });
    if (url.pathname === '/rest/v1/rpc/is_admin') return Response.json(admin);
    if (url.pathname === '/rest/v1/user_bot_access' || url.pathname === '/rest/v1/user_feature_access') return Response.json([]);
    reportCalls++;
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${token}`, 'Reports must retain caller RLS');
    requests.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    if (unavailable) return Response.json({ message: 'missing function' }, { status: 404 });
    if (url.pathname === '/rest/v1/rpc/admin_access_snapshot') return Response.json({ users: [{ id: userId, email: 'researcher@example.edu', role: 'external' }] });
    if (url.pathname === '/rest/v1/rpc/ai_usage_user_totals') return Response.json(totals);
    if (url.pathname === '/rest/v1/rpc/ai_usage_request_totals') return Response.json([{ user_id: userId, input_tokens: null, provider_cost_usd: 0, estimated_cost_usd: null }]);
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
});
test.afterEach(() => mock.restoreAll());

test('date filters use inclusive UTC days and preserve all-time and user selections', () => {
  const f = usageFilters({ from: '2026-11-01', to: '2026-11-09', user: userId, page: '2' });
  assert.deepEqual(reportBounds(f), { p_from: '2026-11-01T00:00:00.000Z', p_to: '2026-11-10T00:00:00.000Z' });
  assert.equal(new URL(usageUrl(f), 'http://localhost').searchParams.get('user'), userId);
  assert.deepEqual(reportBounds(usageFilters({ from: '', to: '' })), { p_from: '-infinity', p_to: 'infinity' });
  assert.equal(usageFilters({}, new Date('2026-11-09T23:59Z')).from, '2026-11-01');
  for (const params of [{ from: '2026-02-30' }, { to: 'bad' }, { from: ['2026-01-01'] }, { from: '2026-02-02', to: '2026-02-01' }, { page: '-1' }, { page: '1.5' }, { page: '10001' }, { user: 'invalid' }]) assert.throws(() => usageFilters(params));
});

test('signed-out and non-admin callers cannot load usage or user identities', async () => {
  loggedIn = false;
  assert.deepEqual(await loadAdminUsage({}), { kind: 'signed-out' });
  loggedIn = true; admin = false;
  assert.deepEqual(await loadAdminUsage({ user: userId }), { kind: 'forbidden' });
  assert.equal(reportCalls, 0);
});

test('admin report keeps user attribution, zero costs and unknown values, with scoped details', async () => {
  totals = [{ user_id: userId, avg_estimated_usd_per_request: 0, known_accounted_cost_usd: null }, { user_id: 'deleted-id', avg_estimated_usd_per_request: null }];
  const result = await loadAdminUsage({ from: '2026-11-01', to: '2026-11-09', user: userId });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') throw new Error('Expected report');
  assert.equal(result.report.users[0].email, 'researcher@example.edu');
  assert.equal(result.report.users[0].avg_estimated_usd_per_request, 0);
  assert.equal(result.report.users[0].known_accounted_cost_usd, null);
  assert.equal(result.report.users[1].email, null);
  assert.equal(result.report.requests[0].input_tokens, null);
  const detail = requests.find(r => r.url.pathname.endsWith('/ai_usage_request_totals'))!;
  assert.equal(detail.url.searchParams.get('user_id'), `eq.${userId}`);
  assert.equal(detail.url.searchParams.get('limit'), '51');
  assert.equal(detail.body.p_to, '2026-11-10T00:00:00.000Z');
});

test('user report pagination is explicit and does not silently truncate at the API row limit', async () => {
  totals = Array.from({ length: 101 }, (_, i) => ({ user_id: `user-${i}` }));
  const result = await loadAdminUsage({ page: '2' });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') throw new Error('Expected report');
  assert.equal(result.report.users.length, 100);
  assert.equal(result.report.hasMoreUsers, true);
  const list = requests.find(r => r.url.pathname.endsWith('/ai_usage_user_totals'))!;
  assert.equal(list.url.searchParams.get('offset'), '100');
  assert.equal(list.url.searchParams.get('limit'), '101');
  assert.equal(requests.some(r => r.url.pathname.endsWith('/ai_usage_request_totals')), false);
});

test('invalid filters never query reports and service failures do not become empty usage', async () => {
  assert.equal((await loadAdminUsage({ to: 'invalid' })).kind, 'invalid');
  assert.equal(reportCalls, 0);
  unavailable = true;
  assert.deepEqual(await loadAdminUsage({}), { kind: 'unavailable' });
});
