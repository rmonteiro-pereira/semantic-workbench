// Example agent client for a workbench in server mode with Entra: it gets an application token
// with MSAL (client credentials, or the managed identity it runs as) and reads the agent catalog.
//
//   SW_URL=https://workbench.example.org \
//   AGENT_TENANT_ID=<tenant id> AGENT_CLIENT_ID=<agent app id> \
//   AGENT_RESOURCE=api://<workbench app id> \
//   AGENT_CERTIFICATE_KEY="$(cat agent-key.pem)" AGENT_CERTIFICATE_THUMBPRINT=<sha-256 hex> \
//   bun scripts/examples/agent-client.ts [project slug]
//
// Without a project slug it lists the projects the client may read, and reads the catalog of the
// only one.
//
// Instead of the certificate pair, set AGENT_CLIENT_SECRET, or AGENT_MANAGED_IDENTITY=1 on an
// Azure resource (AGENT_CLIENT_ID then names a user-assigned identity; omit it for the
// system-assigned one).
import {
  ConfidentialClientApplication,
  ManagedIdentityApplication,
  type NodeAuthOptions,
  type NodeSystemOptions,
} from '@azure/msal-node';

/** How the agent proves its identity to Entra. */
export type AgentCredential =
  | { kind: 'certificate'; privateKey: string; thumbprint: string }
  | { kind: 'secret'; secret: string }
  | { kind: 'managed-identity' };

/** Everything the example needs, read once from the environment. */
export type AgentSettings = {
  workbenchUrl: string;
  tenantId: string;
  clientId: string;
  /** The workbench API's application ID URI, for example `api://<workbench app id>`. */
  resource: string;
  credential: AgentCredential;
  authorityHost: string;
};

type Env = Record<string, string | undefined>;

function readCredential(env: Env): AgentCredential {
  if (env.AGENT_MANAGED_IDENTITY === '1') return { kind: 'managed-identity' };
  const privateKey = env.AGENT_CERTIFICATE_KEY?.trim();
  const thumbprint = env.AGENT_CERTIFICATE_THUMBPRINT?.replaceAll(':', '').trim();
  if (privateKey && thumbprint) return { kind: 'certificate', privateKey, thumbprint };
  const secret = env.AGENT_CLIENT_SECRET?.trim();
  if (secret) return { kind: 'secret', secret };
  throw new Error(
    'Set AGENT_CERTIFICATE_KEY and AGENT_CERTIFICATE_THUMBPRINT, AGENT_CLIENT_SECRET, ' +
      'or AGENT_MANAGED_IDENTITY=1.',
  );
}

/** Reads the example's settings and names every missing variable. */
export function readAgentSettings(env: Env = process.env): AgentSettings {
  const credential = readCredential(env);
  const required = ['SW_URL', 'AGENT_TENANT_ID', 'AGENT_RESOURCE'];
  if (credential.kind !== 'managed-identity') required.push('AGENT_CLIENT_ID');
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}.`);
  return {
    workbenchUrl: env.SW_URL!.replace(/\/+$/, ''),
    tenantId: env.AGENT_TENANT_ID!,
    clientId: env.AGENT_CLIENT_ID?.trim() ?? '',
    resource: env.AGENT_RESOURCE!.replace(/\/+$/, ''),
    credential,
    authorityHost: env.AGENT_AUTHORITY_HOST || 'https://login.microsoftonline.com',
  };
}

/** Options a caller may add to MSAL's configuration, such as a network client. */
export type MsalOverrides = { auth?: Partial<NodeAuthOptions>; system?: NodeSystemOptions };

function clientCredential(credential: AgentCredential): Partial<NodeAuthOptions> {
  if (credential.kind === 'secret') return { clientSecret: credential.secret };
  if (credential.kind !== 'certificate') return {};
  return {
    clientCertificate: {
      privateKey: credential.privateKey,
      thumbprintSha256: credential.thumbprint,
    },
  };
}

/** Gets an application token for the workbench API with MSAL. */
export async function requestAgentToken(
  settings: AgentSettings,
  overrides: MsalOverrides = {},
): Promise<string> {
  if (settings.credential.kind === 'managed-identity') {
    const identity = new ManagedIdentityApplication({
      managedIdentityIdParams: settings.clientId
        ? { userAssignedClientId: settings.clientId }
        : undefined,
      system: overrides.system,
    });
    return (await identity.acquireToken({ resource: settings.resource })).accessToken;
  }
  const application = new ConfidentialClientApplication({
    auth: {
      clientId: settings.clientId,
      authority: `${settings.authorityHost}/${settings.tenantId}`,
      ...clientCredential(settings.credential),
      ...overrides.auth,
    },
    system: overrides.system,
  });
  const result = await application.acquireTokenByClientCredential({
    scopes: [settings.resource + '/.default'],
  });
  if (!result?.accessToken) throw new Error('Entra returned no token.');
  return result.accessToken;
}

/** Lists the projects this client may read, with the slugs the other requests name. */
export async function fetchAgentProjects(settings: AgentSettings, token: string, request = fetch) {
  const response = await request(settings.workbenchUrl + '/api/agent/projects', {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`The workbench answered ${response.status}.`);
  const body = (await response.json()) as { projects: { slug: string; name: string }[] };
  return body.projects;
}

/** Reads the agent catalog of one project: the definitions this client was granted in it. */
export async function fetchAgentCatalog(
  settings: AgentSettings,
  token: string,
  project: string,
  request = fetch,
) {
  const url = `${settings.workbenchUrl}/api/agent/catalog?project=${encodeURIComponent(project)}`;
  const response = await request(url, {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`The workbench answered ${response.status}.`);
  return response.json();
}

if (import.meta.main) {
  const settings = readAgentSettings();
  const token = await requestAgentToken(settings);
  const projects = await fetchAgentProjects(settings, token);
  const project = process.argv[2] ?? (projects.length === 1 ? projects[0]!.slug : undefined);
  if (!project) {
    const slugs = projects.map(item => item.slug).join(', ') || 'none';
    throw new Error(
      `Name the project: bun scripts/examples/agent-client.ts <slug>. Readable: ${slugs}.`,
    );
  }
  console.log(JSON.stringify(await fetchAgentCatalog(settings, token, project), null, 2));
}
