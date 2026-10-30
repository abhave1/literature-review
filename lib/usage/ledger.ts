import { randomUUID } from 'node:crypto';

export type QueryAttemptObserver = (send: () => Promise<Response>, attempt: number) => Promise<Response>;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const cost = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function parseUsage(body: unknown) {
  const root = object(body);
  // Native REST wraps metadata in response; some responses expose it directly.
  const metadata = object(object(root.response).metadata ?? root.metadata);
  const metric = object(metadata.usage_metric);
  const queryId = metadata.query_id ?? root.query_id;
  return {
    provider_query_id: typeof queryId === 'string' ? queryId : null,
    input_tokens: count(metric.input_token_count),
    output_tokens: count(metric.output_token_count),
    cost_usd: cost(metric.total_token_cost),
  };
}

export interface UsageContext {
  user_id: string;
  request_id: string;
  bot_key: string;
  project_name: string;
  operation: 'analyze' | 'screening';
  model_provider: string;
  model_name: string;
}
export interface LedgerStore {
  insert(row: UsageContext & { id: string; call_id: string; attempt: number; status: 'pending' }): Promise<void>;
  finish(id: string, row: ReturnType<typeof parseUsage> & {
    status: 'succeeded' | 'failed'; http_status: number | null; completed_at: string;
  }): Promise<void>;
}

// One call_id per logical query, one durable row per HTTP attempt (including retries).
export function observeQuery(context: UsageContext, store: LedgerStore): QueryAttemptObserver {
  const callId = randomUUID();
  return async (send, attempt) => {
    const id = randomUUID();
    // Fail closed before contacting the model if we cannot record the attempt.
    await store.insert({ ...context, id, call_id: callId, attempt, status: 'pending' });
    const finish = async (response?: Response) => {
      let body: unknown;
      try { body = await response?.clone().json(); } catch { /* Unknown usage stays NULL. */ }
      try {
        await store.finish(id, {
          ...parseUsage(body), status: response?.ok ? 'succeeded' : 'failed',
          http_status: response?.status ?? null, completed_at: new Date().toISOString(),
        });
      } catch {
        // Never retry a paid request because accounting failed. The pending row flags the gap.
        console.error('[usage-ledger] Finalization failed; usage unknown', { ledgerId: id });
      }
    };
    let response: Response;
    try { response = await send(); }
    catch (error) { await finish(); throw error; }
    await finish(response);
    return response;
  };
}
