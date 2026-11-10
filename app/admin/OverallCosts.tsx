'use client';

import { useEffect, useState } from 'react';
import { dailyFilters, type DailyUsage } from '@/lib/usage/daily';
import styles from './admin.module.css';

type State = { kind: 'loading' | 'error' } | { kind: 'ready'; days: DailyUsage[] };
const number = (n: number | null) => n === null ? 'Unknown' : n.toLocaleString('en-US');
const usd = (n: number | null) => n === null ? 'Unknown' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 5, maximumFractionDigits: 8 });

export default function OverallCosts() {
  const [filters, setFilters] = useState(() => dailyFilters({}));
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/admin/usage/daily?${new URLSearchParams(filters)}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (!Array.isArray(body.days)) throw new Error();
        if (!controller.signal.aborted) setState({ kind: 'ready', days: body.days });
      } catch { if (!controller.signal.aborted) setState({ kind: 'error' }); }
    }
    void load();
    return () => controller.abort();
  }, [filters, refresh]);
  function applyDates(start: string, end: string) {
    try {
      const next = dailyFilters({ from: start, to: end });
      setError(''); setFrom(start); setTo(end); setState({ kind: 'loading' }); setFilters(next);
    } catch (e) { setError((e as Error).message); }
  }
  const days = state.kind === 'ready' ? state.days : [];
  const requests = days.reduce((sum, day) => sum + day.request_count, 0);
  const costed = days.reduce((sum, day) => sum + day.requests_with_accounted_cost, 0);
  const measured = days.reduce((sum, day) => sum + day.requests_with_tokens, 0);
  return <section className={styles.overallCosts} aria-label="Overall daily usage and costs">
    <div className={styles.usageHeading}><div><h2>All users · Daily totals</h2><p>{filters.from} through {filters.to} · UTC · USD</p></div>
      <button type="button" className={styles.usageRefresh} disabled={state.kind === 'loading'} onClick={() => { setState({ kind: 'loading' }); setRefresh(n => n + 1); }}>Refresh costs</button></div>
    <form className={styles.usageFilters} onSubmit={event => { event.preventDefault(); applyDates(from, to); }}>
      <label>From (UTC)<input type="date" required min="2000-01-01" max="9998-12-31" value={from} onChange={event => setFrom(event.target.value)}/></label>
      <label>Through (UTC)<input type="date" required min="2000-01-01" max="9998-12-31" value={to} onChange={event => setTo(event.target.value)}/></label>
      <button className={styles.usageRefresh} type="submit">Apply dates</button>
      <button className={styles.usageRefresh} type="button" onClick={() => { const current = dailyFilters({}); applyDates(current.from, current.to); }}>This month</button>
    </form>
    {error && <p role="alert" className={styles.usageNote}>{error}</p>}
    <p className={styles.usageNote}>Across all users, grouped by the day each request started in UTC. Files and later retries stay with that request. Costs use provider-reported USD, otherwise token-based estimates. Incomplete records are excluded from known totals; coverage is shown for every day. Earlier activity before tracking began is not included.</p>
    {state.kind === 'loading' ? <p role="status" className={styles.usageNote}>Loading daily costs…</p>
      : state.kind === 'error' ? <p role="alert" className={styles.usageNote}>Could not load daily costs. Try refreshing costs.</p>
      : <>
        <p className={styles.dailyCoverage}>{number(requests)} requests · {number(measured)} with complete tokens · {number(costed)} with known costs</p>
        <div className={styles.dailyTableScroll} tabIndex={0} role="region" aria-label="Daily usage and costs table"><table className={styles.dailyTable}>
          <thead><tr><th scope="col">Day (UTC)</th><th scope="col">Active users</th><th scope="col">Requests / attempts</th><th scope="col">Known input / output tokens</th><th scope="col">Known cost (USD)</th><th scope="col">Coverage</th></tr></thead>
          <tbody>{[...days].reverse().map(day => <tr key={day.day}>
            <th scope="row">{day.day}</th><td>{number(day.active_users)}</td><td>{number(day.request_count)} / {number(day.attempt_count)}</td>
            <td>{number(day.known_input_tokens)} / {number(day.known_output_tokens)}</td><td>{usd(day.known_accounted_cost_usd)}</td>
            <td>{day.request_count === 0 ? 'No activity' : <>{day.requests_with_tokens} / {day.request_count} token records<br/>{day.requests_with_accounted_cost} / {day.request_count} cost records{day.requests_with_accounted_cost < day.request_count && <strong className={styles.partialCost}>Partial cost coverage</strong>}</>}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
  </section>;
}
