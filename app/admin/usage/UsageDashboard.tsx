import { usageUrl, REQUEST_LIMIT, type UsageReport } from '@/lib/usage/report';
import styles from './usage.module.css';

const tokens = (value: number | null) => value === null ? 'Unknown' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
const usd = (value: number | null) => value === null ? 'Unknown' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 5, maximumFractionDigits: 8 }).format(value);

export default function UsageDashboard({ report }: { report: UsageReport }) {
  const { filters, users, requests } = report;
  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/bots">Research Bot<small>Administration</small></a>
      <nav aria-label="Administration"><a href="/admin">People & access</a><a href="/admin/usage" aria-current="page">Usage & costs</a></nav>
      <a className={styles.back} href="/bots">← Back to workspace</a>
    </aside>
    <div className={styles.content}>
      <header className={styles.heading}><div><p className={styles.eyebrow}>ADMIN WORKSPACE</p><h1>Usage & costs</h1><p>See who is using the research bots and what each request costs.</p></div><span className={styles.badge}>Admin only</span></header>
      <form className={styles.filters} action="/admin/usage" method="get">
        <label>From (UTC)<input type="date" name="from" defaultValue={filters.from} min="2000-01-01" max="9998-12-31" /></label>
        <label>Through (UTC)<input type="date" name="to" defaultValue={filters.to} min="2000-01-01" max="9998-12-31" /></label>
        {filters.user && <input type="hidden" name="user" value={filters.user} />}
        <button type="submit">Apply dates</button><a href={usageUrl(filters, { from: '', to: '', page: 1 })}>All time</a>
      </form>
      <section className={styles.panel} aria-labelledby="people-title">
        <header className={styles.panelHeading}><div><h2 id="people-title">Usage by user</h2><p>Analysis and screening requests started in the selected period. All files and retries are included.</p></div><span>Page {filters.page}</span></header>
        {!users.length ? <p className={styles.empty}>No recorded usage on this page for the selected dates.</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Per-user usage table"><table>
          <thead><tr><th scope="col">User</th><th scope="col">Requests / attempts</th><th scope="col">Average tokens<br/>Input / output</th><th scope="col">Average estimate<br/>USD / request</th><th scope="col">Average accounted<br/>USD / request</th><th scope="col">Known accounted<br/>USD total</th></tr></thead>
          <tbody>{users.map(user => <tr key={user.user_id} data-selected={filters.user === user.user_id}>
            <th scope="row"><a href={usageUrl(filters, { user: user.user_id })}>{user.email ?? 'Unknown or deleted account'}</a><small className={styles.identity}>{user.user_id}</small></th>
            <td>{tokens(user.request_count)} / {tokens(user.attempt_count)}</td>
            <td>{tokens(user.avg_input_tokens_per_request)} / {tokens(user.avg_output_tokens_per_request)}<small>{user.requests_with_tokens} / {user.request_count} requests measured</small></td>
            <td>{usd(user.avg_estimated_usd_per_request)}<small>{user.requests_with_estimates} / {user.request_count} requests estimated</small></td>
            <td>{usd(user.avg_accounted_usd_per_request)}<small>{user.requests_with_accounted_cost} / {user.request_count} requests covered</small></td>
            <td>{usd(user.known_accounted_cost_usd)}<small>{user.requests_with_accounted_cost < user.request_count ? 'Partial total' : 'Complete coverage'}</small></td>
          </tr>)}</tbody>
        </table></div>}
        <footer className={styles.pagination}>{filters.page > 1 && <a href={usageUrl(filters, { page: filters.page - 1 })}>← Previous users</a>}{report.hasMoreUsers && <a href={usageUrl(filters, { page: filters.page + 1 })}>Next users →</a>}</footer>
      </section>
      <div className={styles.explanation}><p><strong>Estimate</strong> uses reported tokens and the saved model rates. <strong>Accounted cost</strong> uses provider-reported cost when available, otherwise the estimate. It is not an invoice.</p><p>Averages include only requests with complete data. Coverage counts show what is included; missing usage is never treated as zero. Tracking began November 9, 2026 (Pacific time); earlier requests are not backfilled.</p></div>
      {filters.user ? <section className={styles.panel} aria-labelledby="requests-title">
        <header className={styles.panelHeading}><div><h2 id="requests-title">Requests · {report.selectedEmail ?? filters.user}</h2><p>{report.hasMoreRequests ? `Latest ${REQUEST_LIMIT} requests shown. Narrow the dates to see earlier requests.` : `${requests.length} ${requests.length === 1 ? 'request' : 'requests'} in this period.`}</p></div><a href={usageUrl(filters, { user: '' })}>Close details</a></header>
        {!requests.length ? <p className={styles.empty}>No recorded requests for this user in the selected period.</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Request usage table"><table>
          <thead><tr><th scope="col">Request / started (UTC)</th><th scope="col">Calls / attempts</th><th scope="col">Tokens<br/>Input / output</th><th scope="col">Reported USD</th><th scope="col">Estimated USD</th><th scope="col">Coverage</th></tr></thead>
          <tbody>{requests.map(request => <tr key={request.request_id}><th scope="row"><span className={styles.identity}>{request.request_id}</span><small>{new Date(request.started_at).toISOString().replace('T', ' ').slice(0, 19)}</small></th><td>{request.call_count} / {request.attempt_count}</td><td>{tokens(request.input_tokens)} / {tokens(request.output_tokens)}</td><td>{usd(request.provider_cost_usd)}</td><td>{usd(request.estimated_cost_usd)}</td><td>{request.pending_attempts > 0 ? `${request.pending_attempts} pending` : 'Finished'}<small>{request.unknown_token_attempts} unknown token attempts<br/>{request.unknown_cost_attempts} unknown cost attempts</small></td></tr>)}</tbody>
        </table></div>}
      </section> : <p className={styles.hint}>Select a user to inspect their individual requests.</p>}
    </div>
  </main>;
}
