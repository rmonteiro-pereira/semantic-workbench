import { releaseTags } from './image';
import type { AppSettings, AzureClient, Release, Revision } from './deploy';

/** Placeholder target shared by offline deployment checks and the runbook. */
export const fakeTarget = {
  AZURE_SUBSCRIPTION_ID: 'subscription',
  AZURE_TENANT_ID: 'tenant',
  ACR_NAME: 'swfake',
  ACA_RESOURCE_GROUP: 'group',
  ACA_ENVIRONMENT: 'environment',
  ACA_NAME: 'workbench',
  APP_IDENTITY_NAME: 'id-sw-app',
  KEY_VAULT_NAME: 'sw-vault',
  ENTRA_TENANT_ID: 'tenant',
  ENTRA_CLIENT_ID: 'client',
  SW_PUBLIC_URL: 'https://workbench.example',
};
/** Release metadata used only by the offline client exercises. */
export const fakeRelease: Release = {
  tag: 'v0.4.0-alpha.1',
  version: '0.4.0',
  packageVersion: '0.4.0',
  commit: 'a'.repeat(40),
  digest: `sha256:${'b'.repeat(64)}`,
};
/** Creates independent preflight fixtures so tests cannot mutate another run's settings. */
export function fakeApp(): AppSettings {
  const identity =
    '/subscriptions/subscription/resourceGroups/group/providers/' +
    'Microsoft.ManagedIdentity/userAssignedIdentities/id-sw-app';
  return {
    mode: 'Single',
    minReplicas: 1,
    maxReplicas: 1,
    volume: true,
    identity,
    registryIdentity: identity,
    port: 4310,
    ingress: { external: true, allowInsecure: false, transport: 'auto', corsOrigins: [] },
    secrets: [
      { name: 'session', url: 'https://sw-vault.vault.azure.net/secrets/session', identity },
    ],
    env: {
      SW_MODE: 'server',
      SW_OIDC_ISSUER: 'https://login.microsoftonline.com/tenant/v2.0',
      SW_HOST: '0.0.0.0',
      SW_TRUSTED_PROXY_HOPS: '1',
      SW_PUBLIC_URL: 'https://workbench.example',
      SW_OIDC_CLIENT_ID: 'client',
      SW_ENTRA_TENANT_ID: 'tenant',
      SW_SESSION_KEY: 'secretref:session',
    },
  };
}

/** Records every read and write without invoking a process or opening a socket. */
export function fakeAzure(options: { tags?: string[]; failSmoke?: boolean } = {}) {
  const calls: [string, unknown?][] = [];
  const previous: Revision = {
    name: 'previous',
    version: '0.3.0',
    commit: 'c'.repeat(40),
    digest: `sha256:${'d'.repeat(64)}`,
  };
  let smokeCalls = 0;
  const client: AzureClient = {
    async tags() {
      calls.push(['tags']);
      return options.tags ?? [];
    },
    async inspect() {
      calls.push(['inspect']);
      return fakeApp();
    },
    async active() {
      calls.push(['active']);
      return previous;
    },
    async previous() {
      calls.push(['previous']);
      return previous;
    },
    async resolve(tag) {
      calls.push(['resolve', tag]);
      return tag === `sha-${previous.commit}` ? previous : { ...fakeRelease, name: tag };
    },
    async scan(digest) {
      calls.push(['scan', digest]);
    },
    async promote(release) {
      calls.push(['promote', release.digest]);
    },
    async lock(release) {
      calls.push(['lock', releaseTags(release)]);
    },
    async update(digest) {
      calls.push(['update', digest]);
      return 'updated';
    },
    async copy(revision) {
      calls.push(['copy', revision.name]);
      return 'restored';
    },
    async wait(name) {
      calls.push(['wait', name]);
    },
    async smoke(revision) {
      calls.push(['smoke', revision]);
      smokeCalls++;
      if (options.failSmoke && smokeCalls === 1) throw Error('Injected smoke failure');
    },
  };
  return { ...client, calls, recorded: previous };
}
