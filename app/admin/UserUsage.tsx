'use client';

import { useEffect, useState } from 'react';
import type { UserUsage as Usage, RequestUsage, UsageFilters } from '@/lib/usage/report';
import { usageFilters } from '@/lib/usage/report';
import styles from './admin.module.css';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; usage: Usage | null; requests: RequestUsage[]; hasMoreRequests: boolean };
const number = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
const dollars = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 5, maximumFractionDigits: 8 });

// The parent keys this component by user ID, clearing the previous person's data immediately.
export default function UserUsage({ userId, initialFilters }: { userId: string; initialFilters?: UsageFilters }) {
  const [from, setFrom] = useState(initialFilters?.from ?? '');
  const [to, setTo] = useState(initialFilters?.to ?? '');
  const [filters, setFilters] = useState(() => usageFilters({ user: userId, from: initialFilters?.from ?? '', to: initialFilters?.to ?? '', page: String(initialFilters?.page ?? 1) }));
  const [filterError, setFilterError] = useState('');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({ user: userId, from: filters.from, to: filters.to, page: String(filters.page) });
        const response = await fetch(`/api/admin/usage?${params}`, { cache: 'no-store', signal: controller.signal });
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
  }, [userId, refresh, filters]);
  function applyDates(start = from, end = to) {
    try {
      const next = usageFilters({ user: userId, from: start, to: end });
      setFilterError(''); setState({ kind: 'loading' }); setFilters(next);
    } catch (error) { setFilterError((error as Error).message); }
  }
  function changePage(page: number) {
    setState({ kind: 'loading' }); setFilters(current => ({ ...current, page }));
  }
  return <section className={styles.userUsage} aria-label="Selected user usage" aria-busy={state.kind === 'loading'}>
    <div className={styles.usageHeading}><div><h3>Usage summary</h3><p>{!filters.from && !filters.to ? 'All recorded usage' : `${filters.from || 'Beginning'} through ${filters.to || 'today'}`} · USD</p></div>
      <button type="button" className={styles.usageRefresh} disabled={state.kind === 'loading'} onClick={() => { setState({ kind: 'loading' }); setRefresh(value => value + 1); }}>Refresh usage</button>
    </div>
    <form className={styles.usageFilters} onSubmit={event => { event.preventDefault(); applyDates(); }}>
      <label>From (UTC)<input type="date" value={from} onChange={event => setFrom(event.target.value)} min="2000-01-01" max="9998-12-31"/></label>
      <label>Through (UTC)<input type="date" value={to} onChange={event => setTo(event.target.value)} min="2000-01-01" max="9998-12-31"/></label>
      <button type="submit" className={styles.usageRefresh}>Apply dates</button>
      <button type="button" className={styles.usageRefresh} onClick={() => { setFrom(''); setTo(''); applyDates('', ''); }}>All time</button>
    </form>
    {filterError && <p role="alert" className={styles.usageNote}>{filterError}</p>}
    {state.kind === 'loading' ? <p role="status" className={styles.usageNote}>Loading usage…</p>
      : state.kind === 'error' ? <p role="alert" className={styles.usageNote}>Could not load usage. Try refreshing usage.</p>
      : state.usage ? <><UsageMetrics usage={state.usage}/><RequestDetails requests={state.requests} hasMore={state.hasMoreRequests} page={filters.page} onPage={changePage}/></>
      : <p className={styles.usageNote}>No requests recorded for this user in the selected period. Earlier activity before tracking was enabled is not included.</p>}
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


function RequestDetails({ requests, hasMore, page, onPage }: { requests: RequestUsage[]; hasMore: boolean; page: number; onPage: (page: number) => void }) {
  return <section className={styles.requestHistory} aria-label="Request history">
    <h3>Request history</h3>
    <p className={styles.usageNote}>Page {page} · {requests.length} {requests.length === 1 ? 'request' : 'requests'} shown, newest first. Times are UTC. Expand a request for details.</p>
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
    <nav className={styles.usagePagination} aria-label="Request history pages">
      <button type="button" className={styles.usageRefresh} disabled={page === 1} onClick={() => onPage(page - 1)}>Newer requests</button>
      <button type="button" className={styles.usageRefresh} disabled={!hasMore || page >= 10000} onClick={() => onPage(page + 1)}>Older requests</button>
    </nav>
  </section>;
}
