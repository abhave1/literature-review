import { redirect } from 'next/navigation';
import { loadAdminUsage } from '@/lib/usage/admin-report';
import type { SearchParams } from '@/lib/usage/report';
import StatusCard from '@/components/ui/StatusCard';
import UsageDashboard from './UsageDashboard';

export const dynamic = 'force-dynamic';
export default async function UsagePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const result = await loadAdminUsage(await searchParams);
  if (result.kind === 'signed-out') redirect('/login?next=/admin/usage');
  if (result.kind === 'forbidden') redirect('/bots');
  if (result.kind !== 'ready') return <StatusCard code="Admin usage" title={result.kind === 'invalid' ? 'Check the filters' : 'Usage is temporarily unavailable'}>
    <p className="mt-3 text-gray-600">{result.kind === 'invalid' ? result.message : 'We could not load the usage report. Please try again.'}</p>
    <a className="mt-4 inline-block underline" href="/admin/usage">Reload usage</a>
  </StatusCard>;
  return <UsageDashboard report={result.report} />;
}
