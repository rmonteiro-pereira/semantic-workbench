// Runs the example agent client against the mock provider's Entra endpoints and checks that the
// server's bearer validation accepts the token MSAL obtained.
import { expect, test } from 'bun:test';
import {
  readAgentSettings,
  requestAgentToken,
  type AgentSettings,
} from '../scripts/examples/agent-client';
import { createBearerValidator } from '../server/auth/bearer';
import { providerNetwork } from '../server/auth/msal-provider';
import { TEST_CLIENTS, TEST_TENANT_ID } from './helpers/auth-identities';
import { entraConfig, withEntraProvider } from './helpers/entra-provider';

test('the example reads one credential and names missing settings', () => {
  const base = {
    SW_URL: 'https://workbench.example.org/',
    AGENT_TENANT_ID: TEST_TENANT_ID,
    AGENT_CLIENT_ID: 'agent',
    AGENT_RESOURCE: 'api://workbench',
  };
  const secret = readAgentSettings({ ...base, AGENT_CLIENT_SECRET: 'value' });
  expect(secret.workbenchUrl).toBe('https://workbench.example.org');
  expect(secret.credential).toEqual({ kind: 'secret', secret: 'value' });
  const certificate = readAgentSettings({
    ...base,
    AGENT_CERTIFICATE_KEY: '-----BEGIN PRIVATE KEY-----',
    AGENT_CERTIFICATE_THUMBPRINT: 'AB:CD',
  });
  expect(certificate.credential).toEqual({
    kind: 'certificate',
    privateKey: '-----BEGIN PRIVATE KEY-----',
    thumbprint: 'ABCD',
  });
  const managed = readAgentSettings({ ...base, AGENT_CLIENT_ID: '', AGENT_MANAGED_IDENTITY: '1' });
  expect(managed.credential).toEqual({ kind: 'managed-identity' });
  expect(() => readAgentSettings(base)).toThrow('AGENT_CLIENT_SECRET');
  expect(() => readAgentSettings({ AGENT_CLIENT_SECRET: 'value' })).toThrow(
    'Missing SW_URL, AGENT_TENANT_ID, AGENT_RESOURCE, AGENT_CLIENT_ID.',
  );
});

test('the token the example gets with MSAL passes the server bearer validation', () =>
  withEntraProvider(async provider => {
    const host = new URL(provider.origin).host;
    const response = await fetch(provider.issuer + '/.well-known/openid-configuration');
    const discovery = await response.json();
    const settings: AgentSettings = {
      workbenchUrl: 'http://127.0.0.1:4310',
      tenantId: TEST_TENANT_ID,
      clientId: TEST_CLIENTS.granted.clientId,
      resource: provider.apiAudience,
      credential: { kind: 'secret', secret: TEST_CLIENTS.granted.secret },
      authorityHost: `https://${host}`,
    };
    // MSAL accepts only https authorities, so the plain-http mock's endpoints are handed to it.
    const token = await requestAgentToken(settings, {
      auth: { knownAuthorities: [host], authorityMetadata: JSON.stringify(discovery) },
      system: { networkClient: providerNetwork(fetch) },
    });
    const config = { ...entraConfig(provider), apiAudience: [provider.apiAudience] };
    const validate = createBearerValidator(config, discovery.jwks_uri);
    const client = await validate('Bearer ' + token);
    expect(client.id).toBe(`client:${TEST_CLIENTS.granted.clientId}`);
  }));
