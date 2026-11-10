import { redirect } from 'next/navigation';
import { usageFilters, usageUrl, type SearchParams } from '@/lib/usage/report';

// Old bookmarks open the overall Costs view or a selected person’s Costs tab.
export default async function UsagePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  let destination = '/admin?tab=costs';
  try {
    destination = usageUrl(usageFilters({ ...params, from: params.from ?? '', to: params.to ?? '', page: '1' }));
  } catch { /* Invalid old filters fall back to the admin workspace. */ }
  redirect(destination);
}
