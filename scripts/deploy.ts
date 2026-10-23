import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkReleaseVersion, compareReleases, releaseTag } from './deploy-version';
import { validateTarget } from './image';
import type { Target } from './image';
/** Validated Azure target settings. */
export type { Target } from './image';
import type { SmokeExpected } from './deploy-smoke';

/** Inspected app settings required before an image or revision is changed. */
export type AppSettings = {
  mode: string;
  minReplicas: number;
  maxReplicas: number;
  volume: boolean;
  identity: string;
  registryIdentity: string;
  port: number;
  secrets: { name: string; url: string; identity: string }[];
  env: Record<string, string>;
};
/** Recorded immutable image metadata and the revision that owns its configuration. */
export type Revision = SmokeExpected & { name: string; digest: string };
/** Validated release input, with the version read from the checked-out manifest. */
export type Release = SmokeExpected & { tag: string; digest: string; packageVersion: string };
/** Azure operations injected so orchestration can be exercised entirely offline. */
export type AzureClient = {
  tags(): Promise<string[]>;
  inspect(): Promise<AppSettings>;
  active(): Promise<Revision>;
  previous(): Promise<Revision>;
  resolve(tag: string): Promise<Revision>;
  scan(digest: string): Promise<void>;
  promote(release: Release): Promise<void>;
  update(digest: string): Promise<string>;
  copy(revision: Revision): Promise<string>;
  wait(name: string): Promise<void>;
  smoke(revision: Revision): Promise<void>;
};

/** Selects an older promoted digest independently of revision creation order. */
export function previousPromotion(
  active: Revision,
  promoted: { tag: string; revision: Revision }[],
  failed: Set<string>,
): Revision {
  const activeTags = promoted.filter(entry => entry.revision.digest === active.digest);
  const activeTag =
    activeTags.sort((left, right) => compareReleases(right.tag, left.tag))[0]?.tag ??
    `v${active.version}`;
  const candidates = promoted.filter(
    entry =>
      compareReleases(entry.tag, activeTag) < 0 &&
      entry.revision.digest !== active.digest &&
      !failed.has(entry.revision.digest),
  );
  candidates.sort((left, right) => compareReleases(right.tag, left.tag));
  if (!candidates[0]) throw Error('No previous promoted version available');
  return candidates[0].revision;
}

/** Derives the trusted issuer from the deployment target rather than app settings. */
export function targetIssuer(target: Target): string {
  return `https://login.microsoftonline.com/${target.ENTRA_TENANT_ID}/v2.0`;
}

/** Refuses target drift by naming the setting that the operator must correct. */
export function preflight(app: AppSettings, target: Target) {
  const identity =
    `/subscriptions/${target.AZURE_SUBSCRIPTION_ID}/resourceGroups/` +
    `${target.ACA_RESOURCE_GROUP}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/` +
    target.APP_IDENTITY_NAME;
  const checks: [string, boolean][] = [
    ['revision mode', app.mode === 'Single'],
    ['replicas', app.minReplicas === 1 && app.maxReplicas === 1],
    ['volume /data', app.volume],
    ['identity', app.identity.toLowerCase() === identity.toLowerCase()],
    ['registry identity', app.registryIdentity.toLowerCase() === identity.toLowerCase()],
    ['SW_MODE', app.env.SW_MODE === 'server'],
    ['SW_HOST', app.env.SW_HOST === '0.0.0.0'],
    ['SW_PORT', (app.env.SW_PORT ?? '4310') === '4310'],
    ['ingress port', app.port === 4310],
    ['SW_OIDC_ISSUER', app.env.SW_OIDC_ISSUER === targetIssuer(target)],
    ['SW_OIDC_CLIENT_ID', app.env.SW_OIDC_CLIENT_ID === target.ENTRA_CLIENT_ID],
    ['SW_ENTRA_TENANT_ID', app.env.SW_ENTRA_TENANT_ID === target.ENTRA_TENANT_ID],
    [
      'Key Vault references',
      app.secrets.length > 0 &&
        app.secrets.every(
          secret =>
            secret.url.startsWith(`https://${target.KEY_VAULT_NAME}.vault.azure.net/secrets/`) &&
            secret.identity.toLowerCase() === identity.toLowerCase(),
        ) &&
        app.secrets.some(secret => app.env.SW_SESSION_KEY === `secretref:${secret.name}`),
    ],
  ];
  const secretSettings = [
    'SW_OIDC_CLIENT_SECRET',
    'SW_OIDC_CLIENT_CERTIFICATE_KEY',
    'SW_GITHUB_CLIENT_SECRET',
  ];
  for (const name of secretSettings) {
    if (!app.env[name]) continue;
    checks.push([
      `Key Vault ${name}`,
      app.secrets.some(secret => app.env[name] === `secretref:${secret.name}`),
    ]);
  }
  const wrong = checks.filter(([, valid]) => !valid).map(([name]) => name);
  if (wrong.length) throw Error(`Preflight failed: ${wrong.join(', ')}`);
}

function validateRelease(release: Release) {
  checkReleaseVersion(release.tag, release.packageVersion, []);
  if (release.version !== release.packageVersion) throw Error('Version differs from package.json');
  if (!/^sha256:[a-f0-9]{64}$/.test(release.digest)) throw Error('Invalid image digest');
  if (!/^[a-f0-9]{40}$/.test(release.commit)) throw Error('Invalid release commit');
}

async function restore(client: AzureClient, revision: Revision) {
  const name = await client.copy(revision);
  await client.wait(name);
  await client.smoke(revision);
  return name;
}

/** Deploys only after read-only guards, restoring the recorded revision on a failed update. */
export async function deploy(target: Target, release: Release, client: AzureClient) {
  validateRelease(release);
  checkReleaseVersion(release.tag, release.packageVersion, await client.tags());
  preflight(await client.inspect(), target);
  const before = await client.active();
  const summary = await updateWithRecovery(client, before, release.digest, release);
  await client.promote(release);
  console.log(JSON.stringify(summary));
  return summary;
}

/** Records the active revision and restores it if an update or smoke check fails. */
export async function updateWithRecovery(
  client: AzureClient,
  before: Revision,
  digest: string,
  expected: SmokeExpected,
) {
  console.log(JSON.stringify({ event: 'record', before }));
  try {
    const name = await client.update(digest);
    await client.wait(name);
    await client.smoke({ ...expected, digest, name });
    const summary = { ok: true, before, after: { ...expected, digest, name } };
    return summary;
  } catch (cause) {
    try {
      const restored = await restore(client, before);
      console.log(JSON.stringify({ ok: false, restored, before, smoke: 'passed' }));
    } catch (rollbackError) {
      throw new AggregateError([cause, rollbackError], 'Deployment and rollback failed');
    }
    throw new Error('Deployment failed; rolled back and smoke passed', { cause });
  }
}

/** Restores a tag digest or the previous revision; manual runs require an actual tag ref. */
export async function rollback(target: Target, to: string, sourceRef: string, client: AzureClient) {
  if (!sourceRef.startsWith('refs/tags/')) throw Error('Rollback requires a tag ref');
  const tag = releaseTag(undefined, sourceRef);
  if (!['previous', 'tag', tag].includes(to))
    throw Error('Rollback version must match the tag ref');
  preflight(await client.inspect(), target);
  const revision = to === 'previous' ? await client.previous() : await client.resolve(tag);
  const commitRevision = await client.resolve(`sha-${revision.commit}`);
  if (commitRevision.digest !== revision.digest) {
    throw Error(`Rollback digest differs from sha-${revision.commit}`);
  }
  await client.scan(revision.digest);
  const before = await client.active();
  const summary = await updateWithRecovery(client, before, revision.digest, revision);
  console.log(JSON.stringify({ ok: true, restored: summary.after }));
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter(arg => arg !== '--'),
    allowPositionals: true,
    options: {
      fake: { type: 'boolean' },
      help: { type: 'boolean' },
      digest: { type: 'string' },
      version: { type: 'string' },
      commit: { type: 'string' },
      to: { type: 'string' },
      'fail-smoke': { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(
      'deploy:azure [--digest sha256:… --version <package-version> --commit <sha>] [--fake]',
    );
    console.log('deploy:rollback --to previous|tag|<vX.Y.Z> [--fake]');
    console.log(
      'SOURCE_REF must name a release tag; IMAGE_DIGEST and BUILD_COMMIT supply defaults.',
    );
    console.log(
      '--fake uses local fixtures; --fail-smoke exercises automatic rollback with --fake.',
    );
    return;
  }
  if (values['fail-smoke'] && !values.fake) throw Error('--fail-smoke requires --fake');
  let target: Target;
  let client: AzureClient;
  let fakeRelease: Release | undefined;
  if (values.fake) {
    const fake = await import('./deploy-fake');
    target = validateTarget({ ...fake.fakeTarget, ...process.env });
    client = fake.fakeAzure({ failSmoke: values['fail-smoke'] });
    fakeRelease = fake.fakeRelease;
  } else {
    target = validateTarget(process.env);
    client = (await import('./deploy-azure')).azureClient(target);
  }
  const sourceRef = process.env.SOURCE_REF ?? (values.fake ? 'refs/tags/v0.4.0-alpha.1' : '');
  if (positionals[0] === 'rollback') {
    await rollback(target, values.to ?? process.env.ROLLBACK_TARGET ?? 'tag', sourceRef, client);
    return;
  }
  if (positionals[0] !== 'deploy') throw Error('Expected deploy or rollback');
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const packageVersion =
    manifest.version ?? (values.fake ? fakeRelease?.packageVersion : undefined);
  const version = values.version ?? packageVersion;
  await deploy(
    target,
    {
      tag: releaseTag(undefined, sourceRef),
      packageVersion,
      version,
      digest: values.digest ?? process.env.IMAGE_DIGEST ?? fakeRelease?.digest ?? '',
      commit: values.commit ?? process.env.BUILD_COMMIT ?? fakeRelease?.commit ?? '',
    },
    client,
  );
}

/** Preserves nested deployment and recovery diagnostics in one machine-readable line. */
export function deploymentFailure(value: unknown): object {
  const error = value instanceof Error ? value : new Error(String(value));
  return {
    ok: false,
    error: error.message,
    cause: error.cause === undefined ? null : deploymentFailure(error.cause),
    errors: error instanceof AggregateError ? error.errors.map(deploymentFailure) : [],
  };
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(JSON.stringify(deploymentFailure(error)));
    process.exitCode = 1;
  });
}
