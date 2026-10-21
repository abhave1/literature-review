import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseFeature, type Account } from '../lib/auth/server';

test('features require a bot grant in the same project; external prompts always fail closed', () => {
  const account = {
    isAdmin: false, grants: ['mxml4'],
    permissions: [{ project_name: 'MxML', code: 'permanent_upload' }],
  } as Account;
  assert.equal(canUseFeature(account, ['mxml4'], 'permanent_upload'), true);
  assert.equal(canUseFeature(account, ['mxml4-open'], 'permanent_upload'), false);
  assert.equal(canUseFeature(account, ['icap'], 'permanent_upload'), false);
  account.permissions = [{ project_name: 'ICAP', code: 'permanent_upload' }];
  assert.equal(canUseFeature(account, ['mxml4'], 'permanent_upload'), false);
  account.permissions = [{ project_name: 'MxML', code: 'prompt_access' }];
  assert.equal(canUseFeature(account, ['mxml4'], 'prompt_access'), false);
  account.isAdmin = true;
  assert.equal(canUseFeature(account, ['mxml4'], 'prompt_access'), true);
  account.permissions = [];
  assert.equal(canUseFeature(account, ['mxml4'], 'prompt_access'), false);
});
