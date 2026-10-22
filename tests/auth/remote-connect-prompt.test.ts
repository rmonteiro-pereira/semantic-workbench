// The browser recognises a request that needs an account and describes connected accounts.
import { expect, test } from 'bun:test';
import { connectRequired } from '../../src/scm/RemoteConnectPrompt';
import { accountsSummary } from '../../src/auth/ConnectedAccounts';
import type { Me } from '../../src/auth/useMe';

const me: Me = {
  mode: 'server',
  name: 'Alice Andrade',
  verifiedEmail: 'alice@example.org',
  roles: { workspace: [], projects: {} },
  roleNames: {},
  connected: { azureDevOps: false, github: false },
  githubConfigured: true,
};

test('only a 428 answer asks to connect, naming GitHub or Azure DevOps', () => {
  expect(connectRequired({ status: 428, body: { connect: 'github' } })).toBe('github');
  expect(connectRequired({ status: 428, body: { connect: 'azure-devops' } })).toBe('azure-devops');
  expect(connectRequired({ status: 403, body: { connect: 'github' } })).toBeNull();
  expect(connectRequired(new Error('Push failed.'))).toBeNull();
  expect(connectRequired(null)).toBeNull();
});

test('the person menu summarises which accounts can push now', () => {
  expect(accountsSummary(me)).toBe('No accounts connected');
  expect(accountsSummary({ ...me, azureDevOpsAvailable: true })).toBe(
    'Azure DevOps through your sign-in',
  );
  expect(accountsSummary({ ...me, connected: { azureDevOps: true, github: true } })).toBe(
    'GitHub connected',
  );
});
