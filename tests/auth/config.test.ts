// Tests how the server reads its environment: modes, required server settings and the checks that
// stop start-up with a message naming the variable at fault.
import { describe, expect, test } from 'bun:test';
import { ConfigError, readConfig, type ServerConfig } from '../../server/config';

const sessionKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('base64');

/** A complete server-mode environment against an Entra tenant. */
function entraEnvironment(): Record<string, string> {
  return {
    SW_MODE: 'server',
    SW_PUBLIC_URL: 'https://workbench.example.org',
    SW_OIDC_ISSUER: 'https://login.microsoftonline.com/4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f/v2.0',
    SW_OIDC_CLIENT_ID: 'semantic-workbench',
    SW_OIDC_CLIENT_SECRET: 'client-secret',
    SW_OIDC_PROVIDER: 'entra',
    SW_ENTRA_TENANT_ID: '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f',
    SW_SESSION_KEY: sessionKey,
    SW_BOOTSTRAP_ADMINS: 'Dave@Example.org, 4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f:a1100000',
  };
}

/** Reads a configuration that must fail and returns the variables the error names. */
function failingVariables(env: Record<string, string>) {
  try {
    readConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).problems.map(problem => problem.variable);
  }
  throw Error('Expected the configuration to be refused.');
}

describe('local mode', () => {
  test('an empty environment gives local mode on loopback port 4310', () => {
    const config = readConfig({});
    expect(config.mode).toBe('local');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4310);
    expect(config.dataDir).toBe('data');
    expect(config.serveStatic).toBe(false);
    expect(config.inContainer).toBe(false);
  });

  test('local mode accepts the loopback names and refuses any other host', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1'])
      expect(readConfig({ SW_HOST: host }).host).toBe(host);
    for (const host of ['0.0.0.0', '192.168.1.10', 'workbench.example.org'])
      expect(failingVariables({ SW_HOST: host })).toEqual(['SW_HOST']);
  });

  test('ports must be whole numbers from 1 to 65535', () => {
    expect(readConfig({ SW_PORT: '4311' }).port).toBe(4311);
    for (const port of ['0', '70000', 'abc', '43.5'])
      expect(failingVariables({ SW_PORT: port })).toEqual(['SW_PORT']);
  });

  test('an unknown mode is refused', () => {
    expect(failingVariables({ SW_MODE: 'cluster' })).toEqual(['SW_MODE']);
  });

  test('container, static serving and build settings are read in both modes', () => {
    const config = readConfig({
      SW_IN_CONTAINER: '1',
      SW_SERVE_STATIC: '1',
      SW_VERSION: '0.4.0',
      SW_COMMIT: 'abc123',
      DATA_DIR: '/data',
      SW_CACHE_DIR: '/tmp/sw-cache',
      CONTAINER_APP_REVISION: 'sw--rev1',
    });
    expect(config.inContainer).toBe(true);
    expect(config.serveStatic).toBe(true);
    expect(config.version).toBe('0.4.0');
    expect(config.commit).toBe('abc123');
    expect(config.dataDir).toBe('/data');
    expect(config.cacheDir).toBe('/tmp/sw-cache');
    expect(config.revision).toBe('sw--rev1');
  });
});

describe('server mode', () => {
  test('a complete Entra environment is accepted with its defaults', () => {
    const config = readConfig(entraEnvironment()) as ServerConfig;
    expect(config.mode).toBe('server');
    expect(config.publicUrl).toBe('https://workbench.example.org');
    expect(config.oidc.provider).toBe('entra');
    expect(config.oidc.scopes).toBe(
      'openid profile email offline_access api://semantic-workbench/access_as_user',
    );
    expect(config.oidc.clientAuth).toEqual({ kind: 'secret', secret: 'client-secret' });
    expect(config.directory.groupClaim).toBe('groups');
    expect(config.directory.overage).toBe('directory');
    expect(config.directory.graphUrl).toBe('https://graph.microsoft.com');
    expect(config.sessionKey.byteLength).toBe(32);
    expect(config.serveStatic).toBe(true);
    expect(config.adoOnBehalfOf).toBe(true);
  });

  test('bootstrap Admins are split into lower-cased addresses and stable ids', () => {
    const config = readConfig(entraEnvironment()) as ServerConfig;
    expect(config.bootstrapAdmins).toEqual({
      emails: ['dave@example.org'],
      ids: ['4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f:a1100000'],
    });
  });

  test('every missing required variable is named in one error', () => {
    const variables = failingVariables({ SW_MODE: 'server' });
    expect(variables).toEqual([
      'SW_PUBLIC_URL',
      'SW_OIDC_ISSUER',
      'SW_OIDC_CLIENT_ID',
      'SW_OIDC_CLIENT_SECRET or SW_OIDC_CLIENT_ASSERTION',
      'SW_SESSION_KEY',
      'SW_BOOTSTRAP_ADMINS',
    ]);
  });

  test('a client secret or a client assertion is required, never both', () => {
    const both = { ...entraEnvironment(), SW_OIDC_CLIENT_ASSERTION: 'managed-identity' };
    expect(failingVariables(both)).toEqual(['SW_OIDC_CLIENT_SECRET or SW_OIDC_CLIENT_ASSERTION']);
    const assertion: Record<string, string> = {
      ...entraEnvironment(),
      SW_OIDC_CLIENT_ASSERTION: 'managed-identity',
    };
    delete assertion.SW_OIDC_CLIENT_SECRET;
    const config = readConfig(assertion) as ServerConfig;
    expect(config.oidc.clientAuth).toEqual({ kind: 'managed-identity' });
  });
});

describe('server mode address and secret checks', () => {
  test('the session key must be 32 bytes of base64', () => {
    const short = { ...entraEnvironment(), SW_SESSION_KEY: Buffer.alloc(16).toString('base64') };
    expect(failingVariables(short)).toEqual(['SW_SESSION_KEY']);
    expect(failingVariables({ ...entraEnvironment(), SW_SESSION_KEY: 'not base64!' })).toEqual([
      'SW_SESSION_KEY',
    ]);
  });

  test('the public URL must be an origin, and plain http only on loopback', () => {
    for (const url of ['https://workbench.example.org/app', 'ftp://workbench.example.org'])
      expect(failingVariables({ ...entraEnvironment(), SW_PUBLIC_URL: url })).toEqual([
        'SW_PUBLIC_URL',
      ]);
    expect(
      failingVariables({ ...entraEnvironment(), SW_PUBLIC_URL: 'http://workbench.example.org' }),
    ).toEqual(['SW_PUBLIC_URL']);
    const loopback = { ...entraEnvironment(), SW_PUBLIC_URL: 'http://127.0.0.1:4310/' };
    expect((readConfig(loopback) as ServerConfig).publicUrl).toBe('http://127.0.0.1:4310');
  });

  test('an http issuer is refused unless the public URL is loopback', () => {
    const issuer = 'http://127.0.0.1:4400/4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f/v2.0';
    expect(failingVariables({ ...entraEnvironment(), SW_OIDC_ISSUER: issuer })).toEqual([
      'SW_OIDC_ISSUER',
    ]);
    const local = {
      ...entraEnvironment(),
      SW_OIDC_ISSUER: issuer,
      SW_PUBLIC_URL: 'http://127.0.0.1:4310',
    };
    expect((readConfig(local) as ServerConfig).oidc.issuer).toBe(issuer);
  });

  test('the directory URL is limited to the Microsoft Graph endpoints', () => {
    for (const url of [
      'https://graph.microsoft.com',
      'https://graph.microsoft.us',
      'https://dod-graph.microsoft.us',
      'https://microsoftgraph.chinacloudapi.cn',
    ])
      expect(
        (readConfig({ ...entraEnvironment(), SW_GRAPH_URL: url }) as ServerConfig).directory
          .graphUrl,
      ).toBe(url);
    for (const url of ['https://graph.example.org', 'http://127.0.0.1:4400/graph'])
      expect(failingVariables({ ...entraEnvironment(), SW_GRAPH_URL: url })).toEqual([
        'SW_GRAPH_URL',
      ]);
  });

  test('a loopback directory URL is accepted only with a loopback public URL', () => {
    const local = {
      ...entraEnvironment(),
      SW_PUBLIC_URL: 'http://127.0.0.1:4310',
      SW_GRAPH_URL: 'http://127.0.0.1:4400/graph',
    };
    expect((readConfig(local) as ServerConfig).directory.graphUrl).toBe(
      'http://127.0.0.1:4400/graph',
    );
  });
});

describe('server mode providers and options', () => {
  test('Entra needs its tenant id; other providers do not', () => {
    const missingTenant = { ...entraEnvironment() };
    delete (missingTenant as Record<string, string>).SW_ENTRA_TENANT_ID;
    expect(failingVariables(missingTenant)).toEqual(['SW_ENTRA_TENANT_ID']);
    const keycloak: Record<string, string> = {
      ...entraEnvironment(),
      SW_OIDC_PROVIDER: 'keycloak',
      SW_OIDC_ISSUER: 'https://sso.example.org/realms/workbench',
    };
    delete keycloak.SW_ENTRA_TENANT_ID;
    const config = readConfig(keycloak) as ServerConfig;
    expect(config.oidc.scopes).toBe('openid profile email offline_access');
    expect(config.oidc.tenantId).toBeNull();
  });

  test('server mode may bind any interface', () => {
    const config = readConfig({ ...entraEnvironment(), SW_HOST: '0.0.0.0' });
    expect(config.host).toBe('0.0.0.0');
  });

  test('GitHub settings come as a complete pair', () => {
    const partial = { ...entraEnvironment(), SW_GITHUB_CLIENT_ID: 'github-app' };
    expect(failingVariables(partial)).toEqual(['SW_GITHUB_CLIENT_SECRET']);
  });

  test('error messages never include a secret value', () => {
    const env = { ...entraEnvironment(), SW_SESSION_KEY: 'c2VjcmV0LXNlc3Npb24ta2V5' };
    try {
      readConfig(env);
    } catch (error) {
      expect((error as Error).message).not.toContain('c2VjcmV0LXNlc3Npb24ta2V5');
      return;
    }
    throw Error('Expected the configuration to be refused.');
  });
});

test('empty and repeated-byte session keys fail with generation instructions', () => {
  for (const key of ['', ...[0, 7, 255].map(byte => Buffer.alloc(32, byte).toString('base64'))]) {
    expect(() => readConfig({ ...entraEnvironment(), SW_SESSION_KEY: key })).toThrow(
      'openssl rand -base64 32',
    );
  }
});

test('the copied server environment requires a generated key', async () => {
  const example = await Bun.file('.env.server.example').text();
  expect(example).toMatch(/^SW_SESSION_KEY=$/m);
});

test('agent token audiences are a comma-separated list, empty when unset', () => {
  const unset = readConfig(entraEnvironment()) as ServerConfig;
  expect(unset.apiAudience).toEqual([]);
  const audiences = 'a1b2c3d4-0000-4000-8000-000000000001, api://semantic-workbench';
  const config = readConfig({ ...entraEnvironment(), SW_API_AUDIENCE: audiences }) as ServerConfig;
  expect(config.apiAudience).toEqual([
    'a1b2c3d4-0000-4000-8000-000000000001',
    'api://semantic-workbench',
  ]);
});

test('Azure DevOps on-behalf-of is an Entra grant and can be turned off', () => {
  const entra = readConfig(entraEnvironment()) as ServerConfig;
  expect(entra.adoOnBehalfOf).toBe(true);
  const off = readConfig({ ...entraEnvironment(), SW_ADO_OBO: 'false' }) as ServerConfig;
  expect(off.adoOnBehalfOf).toBe(false);
  for (const provider of ['keycloak', 'generic']) {
    const other = readConfig({ ...entraEnvironment(), SW_OIDC_PROVIDER: provider });
    expect((other as ServerConfig).adoOnBehalfOf).toBe(false);
  }
});

describe('Entra certificate credential', () => {
  const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----';
  const thumbprint = 'AB:'.repeat(31) + 'AB';

  /** The Entra environment with the certificate pair instead of the client secret. */
  function certificateEnvironment(): Record<string, string> {
    const env: Record<string, string> = {
      ...entraEnvironment(),
      SW_OIDC_CLIENT_CERTIFICATE_KEY: privateKey,
      SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT: thumbprint,
    };
    delete env.SW_OIDC_CLIENT_SECRET;
    return env;
  }

  test('the PEM key and the hex thumbprint form the credential', () => {
    const config = readConfig(certificateEnvironment()) as ServerConfig;
    expect(config.oidc.clientAuth).toEqual({
      kind: 'certificate',
      privateKey,
      thumbprint: 'ab'.repeat(32),
    });
  });

  test('both halves are required and must be well formed', () => {
    const withoutThumbprint = certificateEnvironment();
    delete withoutThumbprint.SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT;
    expect(failingVariables(withoutThumbprint)).toEqual(['SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT']);
    const shortThumbprint = {
      ...certificateEnvironment(),
      SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT: 'ab',
    };
    expect(failingVariables(shortThumbprint)).toEqual(['SW_OIDC_CLIENT_CERTIFICATE_THUMBPRINT']);
    const notPem = { ...certificateEnvironment(), SW_OIDC_CLIENT_CERTIFICATE_KEY: 'secret' };
    expect(failingVariables(notPem)).toEqual(['SW_OIDC_CLIENT_CERTIFICATE_KEY']);
  });

  test('a certificate is the only credential and is for Entra only', () => {
    const withSecret = { ...certificateEnvironment(), SW_OIDC_CLIENT_SECRET: 'secret' };
    expect(failingVariables(withSecret)).toEqual(['SW_OIDC_CLIENT_CERTIFICATE_KEY']);
    const keycloak = { ...certificateEnvironment(), SW_OIDC_PROVIDER: 'keycloak' };
    expect(failingVariables(keycloak)).toEqual(['SW_OIDC_CLIENT_CERTIFICATE_KEY']);
  });

  test('Entra refuses a bare private-key file, which cannot name its certificate', () => {
    const keyFile: Record<string, string> = {
      ...entraEnvironment(),
      SW_OIDC_CLIENT_ASSERTION: '/run/secrets/client.pem',
    };
    delete keyFile.SW_OIDC_CLIENT_SECRET;
    expect(failingVariables(keyFile)).toEqual(['SW_OIDC_CLIENT_ASSERTION']);
    const generic = { ...keyFile, SW_OIDC_PROVIDER: 'generic' };
    const config = readConfig(generic) as ServerConfig;
    expect(config.oidc.clientAuth).toEqual({
      kind: 'private-key',
      keyPath: '/run/secrets/client.pem',
    });
  });
});

describe('Entra issuer host', () => {
  const tenant = '4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f';

  test('Entra accepts the sign-in hosts of the public and national clouds, without a port', () => {
    for (const host of [
      'login.microsoftonline.com',
      'login.microsoftonline.us',
      'login.chinacloudapi.cn',
      'login.partner.microsoftonline.cn',
    ]) {
      const issuer = `https://${host}/${tenant}/v2.0`;
      const config = readConfig({ ...entraEnvironment(), SW_OIDC_ISSUER: issuer }) as ServerConfig;
      expect(config.oidc.issuer).toBe(issuer);
    }
    for (const issuer of [
      `https://login.microsoftonline.com:8443/${tenant}/v2.0`,
      `https://login.example.org/${tenant}/v2.0`,
    ]) {
      expect(failingVariables({ ...entraEnvironment(), SW_OIDC_ISSUER: issuer })).toEqual([
        'SW_OIDC_ISSUER',
      ]);
    }
  });

  test('a loopback Entra issuer needs a loopback public URL, even over https', () => {
    const issuer = `https://127.0.0.1:4400/${tenant}/v2.0`;
    expect(failingVariables({ ...entraEnvironment(), SW_OIDC_ISSUER: issuer })).toEqual([
      'SW_OIDC_ISSUER',
    ]);
    const local = {
      ...entraEnvironment(),
      SW_OIDC_ISSUER: issuer,
      SW_PUBLIC_URL: 'http://127.0.0.1:4310',
    };
    expect((readConfig(local) as ServerConfig).oidc.issuer).toBe(issuer);
    const keycloak = {
      ...entraEnvironment(),
      SW_OIDC_PROVIDER: 'keycloak',
      SW_OIDC_ISSUER: 'https://sso.example.org/realms/workbench',
    };
    expect((readConfig(keycloak) as ServerConfig).oidc.issuer).toBe(keycloak.SW_OIDC_ISSUER);
  });
});
