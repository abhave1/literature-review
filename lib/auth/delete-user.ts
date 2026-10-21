import { NextRequest, NextResponse } from 'next/server';
import type { AdminSnapshot } from './admin-types';

type Target = AdminSnapshot['users'][number];
type Dependencies = {
  getActor: () => Promise<{ user: { id: string }; isAdmin: boolean } | null>;
  getTarget: (id: string) => Promise<Target | undefined>;
  deleteAccount: (id: string) => Promise<void>;
};

// Kept independently testable so destructive requests can be checked without
// ever connecting to a live account or loading a service-role credential.
export async function deleteUser(request: NextRequest, deps: Dependencies) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  }
  try {
    const actor = await deps.getActor();
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    if (!actor.isAdmin) return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    let body;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid deletion request.' }, { status: 400 });
    }
    if (!body || typeof body.userId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId) ||
        typeof body.confirmEmail !== 'string' || body.confirmEmail.length > 254) {
      return NextResponse.json({ error: 'A user ID and confirmation email are required.' }, { status: 400 });
    }
    if (body.userId === actor.user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 403 });
    }
    const target = await deps.getTarget(body.userId);
    if (!target) return NextResponse.json({ error: 'User no longer exists. Refresh the list.' }, { status: 404 });
    if (target.role === 'admin') {
      return NextResponse.json({ error: 'Admin accounts cannot be deleted from this screen.' }, { status: 403 });
    }
    if (!target.email || body.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
      return NextResponse.json({ error: 'Type the selected user’s email to confirm deletion.' }, { status: 400 });
    }
    await deps.deleteAccount(target.id);
    return NextResponse.json({ deletedUserId: target.id });
  } catch {
    return NextResponse.json({ error: 'Deletion could not be confirmed. Refresh the users list before trying again.' }, { status: 503 });
  }
}
