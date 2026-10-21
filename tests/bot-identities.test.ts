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
