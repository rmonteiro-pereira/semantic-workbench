// Supplies explicit configuration for isolated server authentication tests.
import { readConfig, type ServerConfig } from '../../server/config';
import { TEST_TENANT_ID, TEST_WORKBENCH_CLIENT } from './auth-identities';

/** Builds server settings that can send tokens only to the mock provider. */
export function oidcConfig(
  issuer: string,
  graphUrl: string,
  provider = 'entra',
  extra: Record<string, string> = {},
): ServerConfig {
  return readConfig({
    SW_MODE: 'server',
    SW_PUBLIC_URL: 'http://127.0.0.1:4310',
    SW_OIDC_ISSUER: issuer,
    SW_OIDC_CLIENT_ID: TEST_WORKBENCH_CLIENT.clientId,
    SW_OIDC_CLIENT_SECRET: TEST_WORKBENCH_CLIENT.secret,
    SW_OIDC_PROVIDER: provider,
    SW_ENTRA_TENANT_ID: TEST_TENANT_ID,
    SW_GRAPH_URL: graphUrl,
    SW_SESSION_KEY: Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString('base64'),
    SW_BOOTSTRAP_ADMINS: 'root@example.org',
    ...extra,
  }) as ServerConfig;
}
