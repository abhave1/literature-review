import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { deleteUser } from '../lib/auth/delete-user';

const actorId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const target = { id: targetId, email: 'researcher@example.com', role: 'external' };
const body = { userId: targetId, confirmEmail: target.email };
function request(payload: unknown = body, origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/api/admin/users', {
    method: 'DELETE', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
}
function fixture() {
  const deleted: string[] = [];
  return {
    deleted,
    deps: {
      getActor: async (): Promise<{ user: { id: string }; isAdmin: boolean } | null> => ({ user: { id: actorId }, isAdmin: true }),
      getTarget: async (id: string): Promise<typeof target | undefined> => { assert.equal(id, targetId); return target; },
      deleteAccount: async (id: string) => { deleted.push(id); },
    },
  };
}

test('deletion denies cross-origin, anonymous and external callers before target lookup', async () => {
  for (const mode of ['origin', 'anonymous', 'external']) {
    const { deps, deleted } = fixture();
    deps.getTarget = async () => { assert.fail('Unauthorized callers must not load targets'); };
    if (mode === 'anonymous') deps.getActor = async () => null;
    if (mode === 'external') deps.getActor = async () => ({ user: { id: actorId }, isAdmin: false });
    const result = await deleteUser(request(body, mode === 'origin' ? 'https://evil.example' : undefined), deps);
    assert.equal(result.status, mode === 'anonymous' ? 401 : 403);
    assert.deepEqual(deleted, []);
  }
});

test('deletion requires a valid target and matching server-checked email', async () => {
  for (const payload of [null, {}, { ...body, userId: 'bad-id' }, { ...body, confirmEmail: 'another@example.com' }]) {
    const { deps, deleted } = fixture();
    assert.equal((await deleteUser(request(payload), deps)).status, 400);
    assert.deepEqual(deleted, []);
  }
});

test('own account, other admins and missing users cannot be deleted', async () => {
  for (const mode of ['self', 'admin', 'missing']) {
    const { deps, deleted } = fixture();
    if (mode === 'self') deps.getActor = async () => ({ user: { id: targetId }, isAdmin: true });
    if (mode === 'admin') deps.getTarget = async () => ({ ...target, role: 'admin' });
    if (mode === 'missing') deps.getTarget = async () => undefined;
    assert.equal((await deleteUser(request(), deps)).status, mode === 'missing' ? 404 : 403);
    assert.deepEqual(deleted, []);
  }
});

test('confirmed deletion calls the account service exactly once for the selected UUID', async () => {
  const { deps, deleted } = fixture();
  const result = await deleteUser(request({ ...body, confirmEmail: ' Researcher@example.com ' }), deps);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { deletedUserId: targetId });
  assert.deepEqual(deleted, [targetId]);
});

test('verification and provider failures never report success or leak internal errors', async () => {
  for (const stage of ['getActor', 'getTarget', 'deleteAccount'] as const) {
    const { deps, deleted } = fixture();
    deps[stage] = async () => { throw new Error('private provider error'); };
    const result = await deleteUser(request(), deps);
    assert.equal(result.status, 503);
    assert.doesNotMatch(await result.text(), /private provider error/);
    assert.deepEqual(deleted, []);
  }
});
