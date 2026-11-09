import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAccount } from '@/lib/auth/server';
import { canonicalBotId, projectForBot, type BotId } from '@/lib/auth/access';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { observeQuery, type LedgerStore, type UsageContext } from './ledger';

// Identity comes only from Supabase Auth, never a body field or caller-supplied header.
export async function createRequestUsage(botId: BotId, operation: UsageContext['operation']) {
  const account = await getAccount();
  if (!account || !account.grants.includes(botId)) throw new Error('Usage attribution requires an authorized account');
  const db = createSupabaseAdminClient();
  if (!db) throw new Error('Usage ledger is unavailable');
  const store: LedgerStore = {
    async insert(row) {
      const { error } = await db.from('ai_usage_ledger').insert(row).abortSignal(AbortSignal.timeout(10000));
      if (error) throw new Error('Usage ledger is unavailable; model request was not sent');
    },
    async finish(id, row) {
      const { data, error } = await db.from('ai_usage_ledger').update(row).eq('id', id)
        .eq('status', 'pending').select('id').abortSignal(AbortSignal.timeout(10000));
      if (error || data?.length !== 1) throw new Error('Usage ledger finalization failed');
    },
  };
  const context: UsageContext = {
    user_id: account.user.id, request_id: randomUUID(), bot_key: canonicalBotId(botId),
    project_name: projectForBot(botId), operation,
    model_provider: 'gcp-deepmind', model_name: 'geminipro3_1',
  };
  return { forQuery: () => observeQuery(context, store) };
}
