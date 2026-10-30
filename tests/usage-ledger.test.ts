import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { observeQuery, parseUsage, type LedgerStore, type UsageContext } from '../lib/usage/ledger';
import { AsuAimlClient } from '../lib/asu-aiml-client';

const context: UsageContext = { user_id: 'verified-user', request_id: 'request', bot_key: 'mxml4', project_name: 'MxML', operation: 'analyze', model_provider: 'gcp-deepmind', model_name: 'geminipro3_1' };
const metric = { input_token_count: 65, output_token_count: 39, total_token_cost: 0.00091 };
const body = { response: { response: 'answer', metadata: { query_id: 'provider-id', usage_metric: metric } } };
function memoryStore() {
  const inserts: Parameters<LedgerStore['insert']>[0][] = [];
  const finishes: { id: string; row: Parameters<LedgerStore['finish']>[1] }[] = [];
  const store: LedgerStore = { async insert(row) { inserts.push(row); }, async finish(id, row) { finishes.push({ id, row }); } };
  return { store, inserts, finishes };
}
test('parses wrapped and direct metadata, keeps missing/invalid values unknown and genuine zero', () => {
  const expected = { provider_query_id: 'provider-id', input_tokens: 65, output_tokens: 39, cost_usd: 0.00091 };
  assert.deepEqual(parseUsage(body), expected);
  assert.deepEqual(parseUsage(body.response), expected);
  assert.deepEqual(parseUsage({ metadata: { usage_metric: { input_token_count: -1, output_token_count: '39', total_token_cost: Infinity } } }), { provider_query_id: null, input_tokens: null, output_tokens: null, cost_usd: null });
  assert.equal(parseUsage({ metadata: { usage_metric: { input_token_count: 0 } } }).input_tokens, 0);
  assert.equal(parseUsage(null).output_tokens, null);
});
test('actual client records retries as separate attempts but one call, preserves response and does not send identity', async () => {
  const { store, inserts, finishes } = memoryStore();
  let calls = 0;
  mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    const payload = JSON.parse(options.body as string);
    assert.equal(payload.user_id, undefined);
    assert.equal(payload.request_id, undefined);
    assert.equal(payload.model_name, context.model_name);
    return ++calls === 1 ? Response.json({ message: 'busy' }, { status: 503 }) : Response.json(body);
  });
  try {
    const client = new AsuAimlClient({ token: 'fake', maxRetries: 2 });
    assert.deepEqual(await client.query('private prompt', { model_name: context.model_name }, observeQuery(context, store)), body);
    assert.equal(inserts.length, 2);
    assert.equal(inserts[0].call_id, inserts[1].call_id);
    assert.notEqual(inserts[0].id, inserts[1].id);
    assert.deepEqual(inserts.map(row => row.attempt), [1, 2]);
    assert.deepEqual(finishes.map(({ row }) => row.status), ['failed', 'succeeded']);
    assert.equal(finishes[0].row.input_tokens, null);
    assert.equal(finishes[1].row.output_tokens, 39);
    assert.equal(JSON.stringify({ inserts, finishes }).includes('private prompt'), false);
  } finally { mock.restoreAll(); }
});
test('ledger insertion failure prevents model call', async () => {
  let calls = 0;
  const store: LedgerStore = { async insert() { throw new Error('unavailable'); }, async finish() {} };
  await assert.rejects(observeQuery(context, store)(async () => { calls++; return Response.json(body); }, 1));
  assert.equal(calls, 0);
});
test('finalization failure preserves model success, leaves pending record, never resends', async () => {
  const { store, inserts } = memoryStore();
  store.finish = async () => { throw new Error('unavailable'); };
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => { calls++; return Response.json(body); });
  mock.method(console, 'error', () => {});
  try {
    const client = new AsuAimlClient({ token: 'fake' });
    assert.deepEqual(await client.query('x', {}, observeQuery(context, store)), body);
    assert.equal(calls, 1); assert.equal(inserts[0].status, 'pending');
  } finally { mock.restoreAll(); }
});
test('network failures and malformed response usage stay unknown; independent calls share request only', async () => {
  const { store, inserts, finishes } = memoryStore();
  const error = new Error('network');
  await assert.rejects(observeQuery(context, store)(async () => { throw error; }, 1), error);
  const response = await observeQuery(context, store)(async () => new Response('not json'), 1);
  assert.equal(await response.text(), 'not json');
  assert.deepEqual(finishes.map(({ row }) => row.input_tokens), [null, null]);
  assert.equal(finishes[0].row.http_status, null);
  assert.notEqual(inserts[0].call_id, inserts[1].call_id);
  assert.equal(inserts[0].request_id, inserts[1].request_id);
});
