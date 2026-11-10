'use client';

import { useEffect, useState } from 'react';
import type { UserUsage as Usage, RequestUsage } from '@/lib/usage/report';
import { usageUrl } from '@/lib/usage/report';
import styles from './admin.module.css';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; usage: Usage | null; requests: RequestUsage[]; hasMoreRequests: boolean };
const number = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
const dollars = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 5, maximumFractionDigits: 8 });

// The parent keys this component by user ID, clearing the previous person's data immediately.
export default function UserUsage({ userId }: { userId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/admin/usage?user=${encodeURIComponent(userId)}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (body.userId !== userId || (body.usage !== null && body.usage?.user_id !== userId) ||
            !Array.isArray(body.requests) || body.requests.some((row: RequestUsage) => row.user_id !== userId)) throw new Error();
        if (!controller.signal.aborted) setState({ kind: 'ready', usage: body.usage, requests: body.requests, hasMoreRequests: body.hasMoreRequests });
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, [userId, refresh]);
  return <section className={styles.userUsage} aria-label="Selected user usage" aria-busy={state.kind === 'loading'}>
    <div className={styles.usageHeading}><div><h3>Usage & costs</h3><p>All recorded usage · USD</p></div>
      <button type="button" className={styles.usageRefresh} disabled={state.kind === 'loading'} onClick={() => { setState({ kind: 'loading' }); setRefresh(value => value + 1); }}>Refresh usage</button>
    </div>
    {state.kind === 'loading' ? <p role="status" className={styles.usageNote}>Loading usage…</p>
      : state.kind === 'error' ? <p role="alert" className={styles.usageNote}>Could not load usage. Try refreshing usage.</p>
      : state.usage ? <><UsageMetrics usage={state.usage}/><RequestDetails requests={state.requests} hasMore={state.hasMoreRequests}/></>
      : <p className={styles.usageNote}>No requests recorded for this user yet. Earlier activity before tracking was enabled is not included.</p>}
    <a className={styles.usageDetails} href={usageUrl({ user: userId, from: '', to: '', page: 1 })} target="_blank" rel="noopener noreferrer">Open full usage report ↗<span className="sr-only"> (opens in a new tab)</span></a>
  </section>;
}

export function UsageMetrics({ usage: u }: { usage: Usage }) {
  return <>
    <dl className={styles.usageMetrics}>
      <div><dt>Requests</dt><dd>{number(u.request_count)}</dd><small>{number(u.attempt_count)} provider attempts</small></div>
      <div><dt>Avg. input tokens / request</dt><dd>{number(u.avg_input_tokens_per_request)}</dd><small>{u.requests_with_tokens} of {u.request_count} requests measured</small></div>
      <div><dt>Avg. output tokens / request</dt><dd>{number(u.avg_output_tokens_per_request)}</dd><small>Complete token records only</small></div>
      <div><dt>Known total cost</dt><dd>{dollars(u.known_accounted_cost_usd)}</dd><small>{u.requests_with_accounted_cost} of {u.request_count} requests costed</small></div>
      <div><dt>Avg. cost / request</dt><dd>{dollars(u.avg_accounted_usd_per_request)}</dd><small>Provider cost, else estimate</small></div>
      <div><dt>Avg. estimated cost / request</dt><dd>{dollars(u.avg_estimated_usd_per_request)}</dd><small>{u.requests_with_estimates} of {u.request_count} requests estimated</small></div>
    </dl>
    <p className={styles.usageNote}>Costs use provider-reported USD when available, otherwise a token-based estimate. Incomplete requests are excluded from cost totals and averages; unknown values are not zero. Estimates may differ from billed charges.</p>
  </>;
}


function RequestDetails({ requests, hasMore }: { requests: RequestUsage[]; hasMore: boolean }) {
  return <section className={styles.requestHistory} aria-label="Recent requests">
    <h3>Recent requests</h3>
    <p className={styles.usageNote}>{hasMore ? `Showing the latest ${requests.length} requests. ` : `${requests.length} recorded ${requests.length === 1 ? 'request' : 'requests'}. `}Times are UTC. Expand a request for details.</p>
    {requests.map(request => <details key={request.request_id} className={styles.requestDetail}>
      <summary>
        <span><time dateTime={request.started_at}>{new Date(request.started_at).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</time><small>{number(request.call_count)} calls · {number(request.attempt_count)} attempts</small></span>
        <span className={styles.requestCost}>{dollars(request.accounted_cost_usd)}<small>View details</small></span>
      </summary>
      <dl className={styles.usageMetrics}>
        <div><dt>Input tokens</dt><dd>{number(request.input_tokens)}</dd></div>
        <div><dt>Output tokens</dt><dd>{number(request.output_tokens)}</dd></div>
        <div><dt>Provider-reported cost</dt><dd>{dollars(request.provider_cost_usd)}</dd></div>
        <div><dt>Estimated cost</dt><dd>{dollars(request.estimated_cost_usd)}</dd></div>
        <div><dt>Pending attempts</dt><dd>{number(request.pending_attempts)}</dd></div>
        <div><dt>Attempts missing tokens / cost</dt><dd>{number(request.unknown_token_attempts)} / {number(request.unknown_cost_attempts)}</dd></div>
      </dl>
      <p className={styles.requestId}>Request ID: <code>{request.request_id}</code></p>
    </details>)}
  </section>;
}
