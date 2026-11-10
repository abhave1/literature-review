import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { dailyFilters } from '../lib/usage/daily';
import { usageFilters, reportBounds, usageUrl } from '../lib/usage/report';

const userId = '00000000-0000-0000-0000-000000000001';
const jwtPart = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${jwtPart({ alg: 'HS256' })}.${jwtPart({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
const cookie = { name: 'sb-auth-test-auth-token', value: 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: userId } })).toString('base64url') };
mock.module('next/headers', { namedExports: { cookies: async () => ({ getAll: () => [cookie], set: () => {} }) } });
mock.module('next/navigation', { namedExports: { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } } });
let legacyUsagePage: typeof import('../app/admin/usage/page').default;
let loadAdminUsage: typeof import('../lib/usage/admin-report').loadAdminUsage;
let dailyUsageGET: typeof import('../app/api/admin/usage/daily/route').GET;
let dailyRows: object[] = [];
let userUsageGET: typeof import('../app/api/admin/usage/route').GET;
test.before(async () => {
  ({ loadAdminUsage } = await import('../lib/usage/admin-report'));
  ({ GET: userUsageGET } = await import('../app/api/admin/usage/route'));
  ({ GET: dailyUsageGET } = await import('../app/api/admin/usage/daily/route'));
  ({ default: legacyUsagePage } = await import('../app/admin/usage/page'));
});
let loggedIn = true, admin = true, unavailable = false, reportCalls = 0;
let totals: object[] = [];
let detailRows: object[] = [];
let detailsUnavailable = false;
const requests: { url: URL; body: Record<string, unknown> }[] = [];
test.beforeEach(() => {
  loggedIn = true; admin = true; unavailable = false; reportCalls = 0; totals = []; requests.length = 0; detailsUnavailable = false;
  dailyRows = [];
  detailRows = [{ user_id: userId, input_tokens: null, provider_cost_usd: 0, estimated_cost_usd: null }];
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
    if (url.pathname === '/rest/v1/rpc/ai_usage_daily_totals') return Response.json(dailyRows);
    if (url.pathname === '/rest/v1/rpc/ai_usage_user_totals') return Response.json(totals);
    if (url.pathname === '/rest/v1/rpc/ai_usage_request_totals') return detailsUnavailable ? Response.json({ message: 'unavailable' }, { status: 503 }) : Response.json(detailRows);
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
});
test.afterEach(() => mock.restoreAll());

test('date filters use inclusive UTC days and preserve all-time and user selections', () => {
  const f = usageFilters({ from: '2026-11-01', to: '2026-11-09', user: userId, page: '2' });
  assert.deepEqual(reportBounds(f), { p_from: '2026-11-01T00:00:00.000Z', p_to: '2026-11-10T00:00:00.000Z' });
  const link = new URL(usageUrl(f), 'http://localhost');
  assert.equal(link.pathname, '/admin');
  assert.equal(link.searchParams.get('tab'), 'user-costs');
  assert.equal(link.searchParams.get('user'), userId);
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


const usageRequest = (query = `user=${userId}`) => new NextRequest(`https://app.example/api/admin/usage?${query}`);

test('selected-user API denies signed-out, non-admin and cross-origin requests before usage queries', async () => {
  loggedIn = false;
  assert.equal((await userUsageGET(usageRequest())).status, 401);
  loggedIn = true; admin = false;
  assert.equal((await userUsageGET(usageRequest())).status, 403);
  admin = true;
  assert.equal((await userUsageGET(new NextRequest(usageRequest().url, { headers: { origin: 'https://other.example' } }))).status, 403);
  assert.equal(reportCalls, 0);
});

test('selected-user API loads all-time usage for only that user using caller RLS', async () => {
  totals = [{ user_id: userId, request_count: 2, avg_estimated_usd_per_request: 0, known_accounted_cost_usd: null }];
  const response = await userUsageGET(usageRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), { userId, usage: totals[0], requests: detailRows, hasMoreRequests: false });
  assert.equal(reportCalls, 2);
  assert.equal(requests[0].url.pathname, '/rest/v1/rpc/ai_usage_user_totals');
  assert.equal(requests[0].url.searchParams.get('user_id'), `eq.${userId}`);
  assert.deepEqual(requests[0].body, { p_from: '-infinity', p_to: 'infinity' });
  const details = requests.find(row => row.url.pathname.endsWith('/ai_usage_request_totals'))!;
  assert.equal(details.url.searchParams.get('user_id'), `eq.${userId}`);
  assert.equal(details.url.searchParams.get('order'), 'started_at.desc,request_id.asc');
  assert.equal(details.url.searchParams.get('limit'), '51');
  assert.deepEqual(details.body, { p_from: '-infinity', p_to: 'infinity' });
});

test('selected-user API distinguishes no history from unavailable and rejects bad user filters', async () => {
  for (const query of ['', 'user=', 'user=invalid', `user=${userId}&user=${userId}`]) {
    assert.equal((await userUsageGET(usageRequest(query))).status, 400);
  }
  assert.equal(reportCalls, 0);
  detailRows = [];
  assert.deepEqual(await (await userUsageGET(usageRequest())).json(), { userId, usage: null, requests: [], hasMoreRequests: false });
  unavailable = true;
  assert.equal((await userUsageGET(usageRequest())).status, 503);
  unavailable = false;
  totals = [{ user_id: 'another-user' }];
  assert.equal((await userUsageGET(usageRequest())).status, 503);
});


test('selected-user request details are bounded and never leak another user or hide query failures', async () => {
  detailRows = Array.from({ length: 51 }, (_, index) => ({ user_id: userId, request_id: `request-${index}`, input_tokens: null, provider_cost_usd: 0 }));
  const body = await (await userUsageGET(usageRequest())).json();
  assert.equal(body.requests.length, 50);
  assert.equal(body.hasMoreRequests, true);
  assert.equal(body.requests[0].input_tokens, null);
  assert.equal(body.requests[0].provider_cost_usd, 0);
  detailRows = [{ user_id: 'another-user' }];
  assert.equal((await userUsageGET(usageRequest())).status, 503);
  detailRows = []; detailsUnavailable = true;
  assert.equal((await userUsageGET(usageRequest())).status, 503);
});


test('old usage bookmarks redirect into the per-user Costs tab with the selected user and dates', async () => {
  const params = { from: '2026-11-01', to: '2026-11-09', user: userId, page: '5' };
  await assert.rejects(() => legacyUsagePage({ searchParams: Promise.resolve(params) }),
    { message: `REDIRECT:${usageUrl(usageFilters({ ...params, page: '1' }))}` });
  await assert.rejects(() => legacyUsagePage({ searchParams: Promise.resolve({ user: 'invalid' }) }),
    { message: 'REDIRECT:/admin?tab=costs' });
});

test('selected-user dates scope both queries and request pagination leaves totals unpaginated', async () => {
  const response = await userUsageGET(usageRequest(`user=${userId}&from=2026-11-01&to=2026-11-09&page=2`));
  assert.equal(response.status, 200);
  for (const row of requests) assert.deepEqual(row.body, { p_from: '2026-11-01T00:00:00.000Z', p_to: '2026-11-10T00:00:00.000Z' });
  const detail = requests.find(row => row.url.pathname.endsWith('/ai_usage_request_totals'))!;
  assert.equal(detail.url.searchParams.get('offset'), '50');
  assert.equal(detail.url.searchParams.get('limit'), '51');
  const total = requests.find(row => row.url.pathname.endsWith('/ai_usage_user_totals'))!;
  assert.equal(total.url.searchParams.get('offset'), null);
  assert.equal(total.url.searchParams.get('limit'), null);
});

test('invalid dates and request page numbers cannot query usage', async () => {
  for (const filter of ['from=2026-02-30', 'from=2026-11-10&to=2026-11-09', 'from=&from=', 'page=0', 'page=10001', 'page=1&page=2']) {
    assert.equal((await userUsageGET(usageRequest(`user=${userId}&${filter}`))).status, 400);
  }
  assert.equal(reportCalls, 0);
});


const dailyRequest = (query = 'from=2026-11-09&to=2026-11-10') => new NextRequest(`https://app.example/api/admin/usage/daily?${query}`);
test('daily report requires admin before loading data and does not accept user filters', async () => {
  loggedIn = false;
  assert.equal((await dailyUsageGET(dailyRequest())).status, 401);
  loggedIn = true; admin = false;
  assert.equal((await dailyUsageGET(dailyRequest())).status, 403);
  admin = true;
  for (const query of ['from=&to=', 'from=2026-02-30', 'from=2025-01-01&to=2026-11-10', 'from=2026-11-11&to=2026-11-10', 'from=2026-11-09&from=2026-11-10', `user=${userId}`]) {
    assert.equal((await dailyUsageGET(dailyRequest(query))).status, 400);
  }
  assert.equal(reportCalls, 0);
  assert.deepEqual(dailyFilters({}, new Date('2026-11-10T00:00Z')), { from: '2026-11-01', to: '2026-11-10' });
});
test('daily report uses caller RLS, preserves zero/unknown values and checks every requested day', async () => {
  dailyRows = [{ day: '2026-11-09', known_accounted_cost_usd: 0 }, { day: '2026-11-10', known_accounted_cost_usd: null }];
  const response = await dailyUsageGET(dailyRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual((await response.json()).days, dailyRows);
  assert.equal(reportCalls, 1);
  assert.equal(requests[0].url.pathname, '/rest/v1/rpc/ai_usage_daily_totals');
  assert.deepEqual(requests[0].body, { p_from: '2026-11-09', p_through: '2026-11-10' });
  dailyRows = [{ day: '2026-11-10' }];
  assert.equal((await dailyUsageGET(dailyRequest())).status, 503);
  dailyRows = [{ day: '2026-11-09' }, { day: '2026-11-09' }];
  assert.equal((await dailyUsageGET(dailyRequest())).status, 503);
  unavailable = true;
  assert.equal((await dailyUsageGET(dailyRequest())).status, 503);
});
