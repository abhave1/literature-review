import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const uuidList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(uuid);
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_access_snapshot');
  if (error) return NextResponse.json({ error: 'Could not load access management' }, { status: 503 });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const supabase = await createSupabaseServerClient();
    if (body.action === 'project-feature' && uuid(body.projectFeatureId) && typeof body.enabled === 'boolean') {
      const { error } = await supabase.rpc('admin_set_project_feature', { target_project_feature_id: body.projectFeatureId, is_enabled: body.enabled });
      if (error) return NextResponse.json({ error: 'Could not update project feature' }, { status: 400 });
    } else if (body.action === 'membership' && uuid(body.userId) && uuid(body.projectId) && typeof body.member === 'boolean' && uuidList(body.botIds) && uuidList(body.projectFeatureIds)) {
      const { error } = await supabase.rpc('admin_save_user_project', {
        target_user_id: body.userId, target_project_id: body.projectId, is_member: body.member,
        bot_ids: body.botIds, project_feature_ids: body.projectFeatureIds,
      });
      if (error) return NextResponse.json({ error: 'Could not save assignments. Reload and check project membership, bots, and enabled features.' }, { status: 400 });
    } else return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
