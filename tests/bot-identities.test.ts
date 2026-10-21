import test from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, BOT_ROUTES, allowedRoutes, canonicalBotId, projectForBot } from '../lib/auth/access';
import { normalizeBotCatalog } from '../lib/auth/bot-catalog';
import type { AdminSnapshot } from '../lib/auth/admin-types';

test('canonical bots and their route variants are separate', () => {
  assert.equal(BOTS.length, 8);
  assert.equal(BOTS.filter(bot => projectForBot(bot.id)==='MxML').length, 4);
  assert.equal(BOT_ROUTES.length, 11);
  assert.equal(canonicalBotId('mxml4-internal'), 'mxml4');
  assert.deepEqual(allowedRoutes(['mxml4'], false), ['mxml4']);
  assert.deepEqual(allowedRoutes(['mxml4'], true), ['mxml4','mxml4-internal']);
  assert.deepEqual(allowedRoutes(['mxml4-internal'], false), []);
  assert.deepEqual(allowedRoutes(['icap'], false), ['icap']);
  assert.deepEqual(allowedRoutes(['icap'], true), ['icap','icap-internal']);
});

test('admin display keeps the canonical UUID and excludes route variants', () => {
  const snapshot = { bots: [
    {id:'canonical-uuid',project_id:'mxml-uuid',key:'mxml4',name:'Yes/No external'},
    {id:'variant-uuid',project_id:'mxml-uuid',key:'mxml4-internal',name:'Yes/No internal'},
  ] } as AdminSnapshot;
  const normalized = normalizeBotCatalog(snapshot);
  assert.deepEqual(normalized.bots, [{id:'canonical-uuid',project_id:'mxml-uuid',key:'mxml4',name:'MxML4 Yes/No'}]);
  assert.deepEqual(normalizeBotCatalog(normalized),normalized);
});

test('admin lists come out in the same order whatever order the database returns', () => {
  const rows = { users: [{id:'2',email:'zed@x.edu',role:null},{id:'1',email:'amy@x.edu',role:null}],
    projects: [{id:'m',name:'MxML'},{id:'c',name:'CSCL'},{id:'i',name:'ICAP'}],
    features: [{id:'s',code:'prompt_access',name:'System prompts',description:''},{id:'p',code:'permanent_upload',name:'Permanent PDF uploads',description:''}],
    bots: [{id:'b',project_id:'m',key:'mxml4',name:''},{id:'a',project_id:'m',key:'mxml1',name:''}] } as AdminSnapshot;
  const reversed = Object.fromEntries(Object.entries(rows).map(([key, list]) => [key, [...list].reverse()])) as unknown as AdminSnapshot;
  const order = (snapshot: AdminSnapshot) => ['users','projects','features','bots'].map(key => (snapshot[key as keyof AdminSnapshot] as {id:string}[]).map(item => item.id));
  assert.deepEqual(order(normalizeBotCatalog(rows)), order(normalizeBotCatalog(reversed)));
  assert.deepEqual(order(normalizeBotCatalog(rows))[1], ['c','i','m']);
});
