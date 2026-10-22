import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand, waitUntil } from './helpers/processes';
import { versionQuery } from './deploy-version';
import { registryEnvironment, registryLogin } from './image';
import { promotionArguments } from './image';
import { previousPromotion, targetIssuer } from './deploy';
import type { AppSettings, AzureClient, Revision, Target } from './deploy';
import { smoke } from './deploy-smoke';

function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Error(`Invalid Azure ${label} response`);
  }
  return value as Record<string, any>;
}

/** Normalizes Azure's app response at the I/O boundary into preflight settings. */
export function appSettings(value: unknown, target: Target): AppSettings {
  const app = object(value, 'app');
  const properties = object(app.properties, 'properties');
  const configuration = object(properties.configuration, 'configuration');
  const template = object(properties.template, 'template');
  if (!Array.isArray(template.containers) || template.containers.length !== 1) {
    throw Error('Preflight requires exactly one container');
  }
  const container = template.containers[0];
  const identities = Object.keys(app.identity?.userAssignedIdentities ?? {});
  const identity = identities.find(id => id.endsWith(`/${target.APP_IDENTITY_NAME}`)) ?? '';
  const env = Object.fromEntries(
    (container.env ?? []).map((entry: any) => [
      entry.name,
      entry.secretRef ? `secretref:${entry.secretRef}` : entry.value,
    ]),
  );
  return {
    mode: configuration.activeRevisionsMode,
    minReplicas: template.scale?.minReplicas,
    maxReplicas: template.scale?.maxReplicas,
    volume: (container.volumeMounts ?? []).some(
      (mount: any) =>
        mount.mountPath === '/data' &&
        (template.volumes ?? []).some(
          (volume: any) =>
            volume.name === mount.volumeName &&
            ['AzureFile', 'NfsAzureFile'].includes(volume.storageType),
        ),
    ),
    identity,
    registryIdentity:
      (configuration.registries ?? []).find(
        (registry: any) => registry.server === `${target.ACR_NAME}.azurecr.io`,
      )?.identity ?? '',
    port: configuration.ingress?.targetPort,
    secrets: (configuration.secrets ?? []).map((secret: any) => ({
      name: secret.name,
      url: secret.keyVaultUrl ?? '',
      identity: secret.identity ?? '',
    })),
    env,
  };
}

type AzureIO = ReturnType<typeof azureIO>;

function azureIO(target: Target, command: typeof runCommand) {
  const scope = [
    '--subscription',
    target.AZURE_SUBSCRIPTION_ID,
    '--resource-group',
    target.ACA_RESOURCE_GROUP,
    '--name',
    target.ACA_NAME,
  ];
  const repository = `${target.ACR_NAME}.azurecr.io/semantic-workbench`;
  const json = async (args: string[]) => {
    const output = args.includes('--output') ? args : [...args, '-o', 'json'];
    return JSON.parse(await command(output, true));
  };
  const app = () => json(['az', 'containerapp', 'show', ...scope]);
  const revisions = async (): Promise<Record<string, any>[]> => {
    const result = await json(['az', 'containerapp', 'revision', 'list', '--all', ...scope]);
    if (!Array.isArray(result)) throw Error('Invalid Azure revisions response');
    return result.map(value => object(value, 'revision'));
  };
  const registry = <T>(run: (env: NodeJS.ProcessEnv) => Promise<T>) =>
    withRegistry(target, command, run);
  return { target, command, scope, repository, json, app, revisions, registry };
}

async function withRegistry<T>(
  target: Target,
  command: typeof runCommand,
  run: (env: NodeJS.ProcessEnv) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'sw-deploy-registry-'));
  const env = { ...process.env, ...registryEnvironment('docker', directory) };
  try {
    await command(registryLogin(`${target.ACR_NAME}.azurecr.io`), false, env);
    return await run(env);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function imageMetadata(io: AzureIO, image: string, name: string): Promise<Revision> {
  const { repository, registry, command } = io;
  const digest = image.split('@')[1];
  if (!image.startsWith(`${repository}@`) || !/^sha256:[a-f0-9]{64}$/.test(digest ?? '')) {
    throw Error(`Revision ${name} is not pinned to a target registry digest`);
  }
  const output = await registry(env =>
    command(
      ['docker', 'buildx', 'imagetools', 'inspect', image, '--format', '{{json .Image}}'],
      true,
      env,
    ),
  );
  const config = object(JSON.parse(output), 'image configuration');
  const labels = config.config?.Labels;
  const version = labels?.['org.opencontainers.image.version'];
  const commit = labels?.['org.opencontainers.image.revision'];
  if (typeof version !== 'string' || !/^[a-f0-9]{40}$/.test(commit ?? '')) {
    throw Error(`Revision ${name} lacks valid version and commit labels`);
  }
  return { name, digest, version, commit };
}

function readOperations(io: AzureIO) {
  const { target, json, app, revisions, repository } = io;
  const metadata = (image: string, name: string) => imageMetadata(io, image, name);
  const fromRevision = (revision: Record<string, any>) =>
    metadata(revision.properties?.template?.containers?.[0]?.image ?? '', revision.name);
  const operations: Pick<AzureClient, 'tags' | 'inspect' | 'active' | 'previous' | 'resolve'> = {
    async tags() {
      const result = await json([
        ...versionQuery(target.ACR_NAME),
        '--subscription',
        target.AZURE_SUBSCRIPTION_ID,
      ]);
      if (!Array.isArray(result) || result.some(tag => typeof tag !== 'string')) {
        throw Error('Invalid Azure registry tags response');
      }
      return result;
    },
    async inspect() {
      return appSettings(await app(), target);
    },
    async active() {
      const active = (await revisions()).filter(revision => revision.properties?.active);
      if (active.length !== 1) throw Error('Expected one active revision to record');
      return fromRevision(active[0]);
    },
    async previous() {
      const active = await operations.active();
      const history = await revisions();
      const failed = new Set(
        history
          .filter(
            revision =>
              ['Failed', 'Degraded'].includes(revision.properties?.runningState) ||
              revision.properties?.healthState === 'Unhealthy',
          )
          .map(revision => revision.properties?.template?.containers?.[0]?.image?.split('@')[1]),
      );
      const tags = (await operations.tags()).filter(tag => tag.startsWith('v'));
      const promoted = await Promise.all(
        tags.map(async tag => ({
          tag,
          revision: await operations.resolve(tag),
        })),
      );
      return previousPromotion(active, promoted, failed);
    },
    async resolve(tag) {
      const result = await json([
        'az',
        'acr',
        'repository',
        'show',
        '--name',
        target.ACR_NAME,
        '--subscription',
        target.AZURE_SUBSCRIPTION_ID,
        '--image',
        `semantic-workbench:${tag}`,
      ]);
      return metadata(`${repository}@${result.digest}`, tag);
    },
  };
  return operations;
}

function writeOperations(io: AzureIO) {
  const { target, registry, command, json, scope, repository } = io;
  const operations: Pick<AzureClient, 'promote' | 'update' | 'copy' | 'scan'> = {
    async scan(digest) {
      await command(
        ['bun', 'scripts/image.ts', 'scan', '--ref', `${repository}@${digest}`],
        false,
        { ...process.env, ...target },
      );
    },
    async promote(release) {
      await registry(env => command(promotionArguments(target, release), false, env));
    },
    async update(digest) {
      const result = await json([
        'az',
        'containerapp',
        'update',
        ...scope,
        '--image',
        `${repository}@${digest}`,
      ]);
      return revisionName(result);
    },
    async copy(revision) {
      const result = await json([
        'az',
        'containerapp',
        'revision',
        'copy',
        ...scope,
        '--from-revision',
        revision.name,
      ]);
      return revisionName(result);
    },
  };
  return operations;
}

function monitorOperations(io: AzureIO) {
  const { json, scope, target } = io;
  const operations: Pick<AzureClient, 'wait' | 'smoke'> = {
    async wait(name) {
      await waitUntil(
        `Azure revision ${name}`,
        async () => {
          const result = await json([
            'az',
            'containerapp',
            'revision',
            'show',
            ...scope,
            '--revision',
            name,
          ]);
          return (
            result.properties?.runningState === 'Running' &&
            result.properties?.healthState === 'Healthy'
          );
        },
        180_000,
      );
    },
    async smoke(revision) {
      const result = await smoke(target.SW_PUBLIC_URL, revision, { issuer: targetIssuer(target) });
      for (const check of result.checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}`);
      console.log(JSON.stringify(result));
      if (!result.ok) throw Error('Deployment smoke failed');
    },
  };
  return operations;
}

/** Implements deployment I/O with argument arrays and isolated registry credentials. */
export function azureClient(target: Target, command = runCommand): AzureClient {
  const io = azureIO(target, command);
  return { ...readOperations(io), ...writeOperations(io), ...monitorOperations(io) };
}

function revisionName(value: unknown): string {
  const name = object(value, 'update').properties?.latestRevisionName;
  if (typeof name !== 'string' || !name) throw Error('Azure update returned no revision name');
  return name;
}
