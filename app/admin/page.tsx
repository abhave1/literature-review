import { redirect } from 'next/navigation';
import { getAccount } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AdminSnapshot } from '@/lib/auth/admin-types';
import AdminAccess from './AdminAccess';
import StatusCard from '@/components/ui/StatusCard';
export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  const account = await getAccount();
  if (!account) redirect('/login?next=/admin');
  if (!account.isAdmin) redirect('/bots');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_access_snapshot');
  if (error) return <StatusCard code="Admin" title="Access management unavailable">
    <p className="mt-3 text-[15px] leading-relaxed text-gray-600">Check that the project permissions and admin migrations have been applied, then reload.</p>
  </StatusCard>;
  return <AdminAccess initial={data as AdminSnapshot} />;
}
