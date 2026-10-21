import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { AdminSnapshot } from '@/lib/auth/admin-types';

export async function POST(request: NextRequest) {
  // Authorize using the caller's verified session before using privileged credentials.
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let email: string;
  try {
    const body = await request.json();
    if (typeof body.email !== 'string') throw new Error('Invalid email');
    email = body.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  } catch {
    return NextResponse.json({ error: 'Enter a valid Google account email address.' }, { status: 400 });
  }
  const session = await createSupabaseServerClient();
  const { data: snapshot, error: snapshotError } = await session.rpc('admin_access_snapshot');
  if (snapshotError) return NextResponse.json({ error: 'Could not verify existing users. Try again.' }, { status: 503 });
  const existing = (snapshot as AdminSnapshot).users.find(user => user.email?.toLowerCase() === email);
  if (existing) return NextResponse.json({ userId: existing.id, existing: true });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: 'User creation is not configured on this server.' }, { status: 503 });
  // No password, confirmation bypass, or email delivery. Google verifies ownership
  // when the user first signs in and links its identity to the matching account.
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: false });
  if (error || !data.user) {
    return NextResponse.json({ error: 'Could not create this account. It may already exist; refresh the users list and try again.' }, { status: 409 });
  }
  // No role/grant is accepted from the request. New accounts start with zero access.
  // The existing admin_save_user_project RPC assigns external on first membership.
  return NextResponse.json({ userId: data.user.id, existing: false }, { status: 201 });
}
