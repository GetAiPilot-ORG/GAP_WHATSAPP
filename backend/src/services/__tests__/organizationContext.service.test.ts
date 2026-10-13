import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveUserOrganizationContext, checkOrganizationSubscription } from '../organizationContext.service.js';

test('resolveUserOrganizationContext throws when agent profile is missing', async () => {
  await assert.rejects(
    () =>
      resolveUserOrganizationContext({
        user: { id: 'fake_agent_id', email: 'agent@example.com' },
        portal: 'agent',
      }),
    /Agent profile was not found/
  );
});

test('checkOrganizationSubscription returns boolean safely on query errors', async () => {
  const result = await checkOrganizationSubscription('non-existent-org-uuid');
  assert.equal(typeof result, 'boolean');
});
