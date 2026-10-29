import { runCommand as command } from './helpers/processes';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';

/** Scanner image pinned independently of the application's base image. */
export const trivyImage = 'docker.io/aquasec/trivy:0.67.2@sha256:ac2f9d0197456a8ce460884b113e49d65b667f506c31d014c9955869a7a5d682';
/** Azure target settings checked before using an authenticated session. */
export const targetVariables = [
  'AZURE_SUBSCRIPTION_ID',
  'AZURE_TENANT_ID',
  'ACR_NAME',
  'ACA_RESOURCE_GROUP',
  'ACA_ENVIRONMENT',
  'ACA_NAME',
  'APP_IDENTITY_NAME',
  'KEY_VAULT_NAME',
  'ENTRA_TENANT_ID',
  'ENTRA_CLIENT_ID',
  'SW_PUBLIC_URL',
] as const;
/** Required target settings validated at the environment boundary. */
export type Target = Record<(typeof targetVariables)[number], string>;
/** Supported local container runtime. */
export type Engine = 'docker' | 'podman';
/** Immutable inputs used to construct image commands. */
export type ImageContext = {
  engine: Engine;
  commit: string;
  version: string;
  created: string;
  source: string;
};

/** Chooses an installed runtime and refuses a missing explicit selection. */
export function chooseEngine(available: string[], requested?: string): Engine {
  const engine = requested ?? ['docker', 'podman'].find(name => available.includes(name));
  if (!engine || !['docker', 'podman'].includes(engine) || !available.includes(engine)) {
    throw Error(`Container runtime unavailable: ${requested ?? 'install Docker or Podman'}`);
  }
  return engine as Engine;
}

/** Names image revisions from a full Git object id and working-tree status. */
export function imageCommit(commit: string, dirty: boolean): string {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Expected a full 40-hex Git commit');
  return commit + (dirty ? '-dirty' : '');
}

/** Validates documented vulnerability exceptions against an injected date. */
export function parseTrivyIgnore(source: string, today: string): string[] {
  return source.split(/\r?\n/).flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const match = /^(CVE-\d{4}-\d+)\s+#\s*(\S.*?)\s*; expires (\d{4}-\d{2}-\d{2})$/.exec(trimmed);
    if (!match) throw Error(`.trivyignore:${index + 1}: expected CVE, reason and expiry`);
    const date = new Date(match[3]);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[3]) {
      throw Error(`.trivyignore:${index + 1}: invalid expiry date`);
    }
    if (match[3] < today) throw Error(`.trivyignore:${index + 1}: expired ${match[1]}`);
    return [match[1]];
  });
}

/** Builds tags and metadata while retaining HEALTHCHECK under Podman. */
export function buildArguments(context: ImageContext, tags: string[] = []): string[] {
  const format = context.engine === 'podman' ? ['--format', 'docker'] : [];
  const labels = {
    SW_VERSION: context.version,
    SW_COMMIT: context.commit,
    SW_CREATED: context.created,
    SW_SOURCE: context.source,
  };
  return [
    context.engine,
    'build',
    ...format,
    ...Object.entries(labels).flatMap(([name, value]) => ['--build-arg', `${name}=${value}`]),
    ...[`semantic-workbench:sha-${context.commit}`, 'semantic-workbench:dev', ...tags].flatMap(tag => ['--tag', tag]),
    '.',
  ];
}

/** Returns the Azure login command for a strictly validated registry hostname. */
export function registryLogin(registry: string): string[] {
  const match = /^([a-zA-Z0-9]{5,50})\.azurecr\.io$/.exec(registry);
  if (!match) throw Error(`Invalid Azure registry: ${registry}`);
  return ['az', 'acr', 'login', '--name', match[1]];
}

/** Plans a clean commit push without running Azure or a container engine. */
export function pushArguments(context: ImageContext, registry: string): string[][] {
  if (context.commit.endsWith('-dirty')) throw Error('Refusing to push a -dirty commit');
  const login = registryLogin(registry);
  const local = `semantic-workbench:sha-${context.commit}`;
  const remote = `${registry}/${local}`;
  return [login, [context.engine, 'tag', local, remote], [context.engine, 'push', remote]];
}

/** Creates a version tag on the existing scanned manifest without rebuilding or importing. */
export function promotionArguments(target: Target, release: { tag: string; digest: string }): string[] {
  const repository = `${target.ACR_NAME}.azurecr.io/semantic-workbench`;
  return ['docker', 'buildx', 'imagetools', 'create', '--prefer-index=false', '--tag', `${repository}:${release.tag}`, `${repository}@${release.digest}`];
}

/** Names the registry tags of one release, commit tag first so a rerun can finish the locking. */
export function releaseTags(release: { tag: string; commit: string }): string[] {
  return [`sha-${release.commit}`, release.tag];
}

/** Makes one registry tag read-only so a holder of push rights cannot repoint it later. */
export function lockArguments(target: Target, tag: string): string[] {
  return ['az', 'acr', 'repository', 'update', '--name', target.ACR_NAME, '--subscription', target.AZURE_SUBSCRIPTION_ID, '--image', `semantic-workbench:${tag}`, '--write-enabled', 'false'];
}

/** Builds scanner flags for an archive or authenticated registry digest. */
export function scanArguments(kind: 'scan' | 'sbom', ref?: string): string[][] {
  if (ref && !/^[a-zA-Z0-9]+\.azurecr\.io\/semantic-workbench@sha256:[a-f0-9]{64}$/.test(ref)) {
    throw Error('--ref must be an Azure registry image pinned by digest');
  }
  const input = ref ? [ref] : ['--input', 'out/image/image.tar'];
  if (kind === 'sbom') {
    return [['image', '--format', 'spdx-json', '--output', 'out/image/sbom.spdx.json', ...input]];
  }
  return ['json', 'sarif'].map(format => [
    'image',
    '--severity',
    'CRITICAL,HIGH',
    '--ignore-unfixed',
    '--exit-code',
    '1',
    '--ignorefile',
    '.trivyignore',
    '--format',
    format,
    '--output',
    `out/image/trivy.${format}`,
    ...input,
  ]);
}

/** Requires target variables before an Azure command can run. */
export function validateTarget(env: Record<string, string | undefined>): Target {
  const missing = targetVariables.filter(name => !env[name]?.trim());
  if (missing.length) throw Error(`Missing target variables: ${missing.join(', ')}`);
  return Object.fromEntries(targetVariables.map(name => [name, env[name]])) as Target;
}

/** Plans registry authentication or local archive export before scanning. */
export function scanPreparation(context: ImageContext, ref?: string): string[] {
  if (ref) {
    scanArguments('scan', ref);
    return registryLogin(ref.split('/')[0]);
  }
  return [context.engine, 'save', '-o', 'out/image/image.tar', `semantic-workbench:sha-${context.commit}`];
}

/** Isolates registry credentials and makes Azure CLI use the chosen runtime. */
export function registryEnvironment(engine: Engine, directory: string) {
  return {
    DOCKER_COMMAND: engine,
    DOCKER_CONFIG: directory,
    REGISTRY_AUTH_FILE: join(directory, 'config.json'),
  };
}

async function withRegistry<T>(context: ImageContext, registry: string, run: (env: NodeJS.ProcessEnv) => Promise<T>, runCommand = command): Promise<T> {
  validateTarget(process.env);
  const directory = await mkdtemp(join(tmpdir(), 'sw-registry-'));
  const env = { ...process.env, ...registryEnvironment(context.engine, directory) };
  try {
    await runCommand(registryLogin(registry), false, env);
    return await run(env);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function runScanner(commands: string[][], context: ImageContext, env = process.env, authenticated = false) {
  const scanner = Bun.which('trivy');
  const authMount = authenticated ? ['-v', `${env.DOCKER_CONFIG}:/root/.docker:ro`] : [];
  const prefix = scanner ? [scanner] : [context.engine, 'run', '--rm', '-v', `${process.cwd()}:/work`, '-w', '/work', ...authMount, trivyImage];
  const failures: string[] = [];
  for (const args of commands) {
    try {
      await command([...prefix, ...args], false, env);
    } catch (error) {
      failures.push((error as Error).message);
    }
  }
  if (failures.length) throw Error(failures.join('\n'));
}

async function scan(kind: 'scan' | 'sbom', context: ImageContext, ref?: string) {
  const commands = scanArguments(kind, ref);
  parseTrivyIgnore(await readFile('.trivyignore', 'utf8'), new Date().toISOString().slice(0, 10));
  if (ref) {
    await withRegistry(context, ref.split('/')[0], env => runScanner(commands, context, env, true));
    return;
  }
  try {
    await command(scanPreparation(context));
    await runScanner(commands, context);
  } finally {
    await rm('out/image/image.tar', { force: true });
  }
}

/** A registry tag as it stands now: the digest it points to and whether it is read-only. */
export type RegistryTag = { digest: string; locked: boolean };

/** Reads a registry tag, or null when the registry has no such tag. */
export async function registryTag(acrName: string, tag: string, runCommand = command): Promise<RegistryTag | null> {
  const args = [
    'az',
    'acr',
    'repository',
    'show',
    '--name',
    acrName,
    '--image',
    `semantic-workbench:${tag}`,
    '--query',
    '{digest: digest, writeEnabled: changeableAttributes.writeEnabled}',
    '-o',
    'json',
  ];
  let output: string;
  try {
    output = await runCommand(args, true);
  } catch (error) {
    if (/NAME_UNKNOWN|MANIFEST_UNKNOWN|not found/i.test((error as Error).message)) return null;
    throw error;
  }
  const value = JSON.parse(output);
  if (!/^sha256:[a-f0-9]{64}$/.test(value?.digest ?? '') || typeof value.writeEnabled !== 'boolean') {
    throw Error(`Invalid registry response for ${tag}`);
  }
  return { digest: value.digest, locked: value.writeEnabled === false };
}

/** Requires an image's recorded commit and version to be the ones being published. */
export function assertImageLabels(labels: Record<string, string> | undefined, context: ImageContext) {
  const revision = labels?.['org.opencontainers.image.revision'];
  const version = labels?.['org.opencontainers.image.version'];
  if (revision !== context.commit || version !== context.version) {
    throw Error(`Existing image is labelled ${revision}/${version}, not ${context.commit}/${context.version}`);
  }
}

async function readImageLabels(ref: string, env: NodeJS.ProcessEnv, runCommand: typeof command) {
  const inspect = ['docker', 'buildx', 'imagetools', 'inspect', ref, '--format', '{{json .Image}}'];
  return JSON.parse(await runCommand(inspect, true, env)).config?.Labels;
}

function pushedDigest(engine: Engine, output: string, digestFile: string): Promise<string> {
  if (engine === 'podman') return readFile(digestFile, 'utf8').then(text => text.trim());
  const match = /digest: (sha256:[a-f0-9]{64})/.exec(output);
  if (!match) throw Error('The push did not report an image digest');
  return Promise.resolve(match[1]);
}

/** What `image:push` did: the commit tag's digest, and whether it was already there. */
export type CommitPush = { digest: string; kept: boolean };

/**
 * Pushes the commit image once and locks its tag. An existing commit tag is never overwritten: it
 * is kept only if it is locked and its labels name this commit and version.
 */
export async function pushCommitImage(context: ImageContext, registry: string, target: Target, runCommand = command): Promise<CommitPush> {
  const commands = pushArguments(context, registry);
  const acrName = registry.split('.')[0];
  const tag = `sha-${context.commit}`;
  const existing = await registryTag(acrName, tag, runCommand);
  if (existing !== null) {
    if (!existing.locked) throw Error(`${tag} exists but is not locked; refusing to trust it`);
    const ref = `${registry}/semantic-workbench@${existing.digest}`;
    const labels = await withRegistry(context, registry, env => readImageLabels(ref, env, runCommand), runCommand);
    assertImageLabels(labels, context);
    console.error(`${tag} already exists in ${registry}; keeping its digest.`);
    return { digest: existing.digest, kept: true };
  }
  const digest = await withRegistry(
    context,
    registry,
    async env => {
      await runCommand(commands[1], false, env);
      const digestFile = join(env.DOCKER_CONFIG!, 'digest');
      const pushCommand = context.engine === 'podman' ? [...commands[2], '--digestfile', digestFile] : commands[2];
      const output = await runCommand(pushCommand, true, env);
      return pushedDigest(context.engine, output, digestFile);
    },
    runCommand,
  );
  await runCommand(lockArguments(target, tag), false);
  const after = await registryTag(acrName, tag, runCommand);
  if (after?.digest !== digest) throw Error(`${tag} does not point to the pushed digest`);
  return { digest, kept: false };
}

async function push(context: ImageContext, registry: string) {
  const target = validateTarget(process.env);
  if (registry !== `${process.env.ACR_NAME}.azurecr.io`) throw Error('Registry differs from ACR_NAME');
  const { digest, kept } = await pushCommitImage(context, registry, target);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw Error(`Invalid pushed digest: ${digest}`);
  if (kept) {
    const ref = `${registry}/semantic-workbench@${digest}`;
    await scan('scan', context, ref);
    await scan('sbom', context, ref);
  }
  console.log(digest);
  if (process.env.TF_BUILD) console.log(`##vso[task.setvariable variable=digest;isOutput=true]${digest}`);
}

/** Reads local build metadata consistently for all image consumers. */
export async function readImageContext(engine: Engine): Promise<ImageContext> {
  const commit = await command(['git', 'rev-parse', 'HEAD'], true);
  const dirty = await command(['git', 'status', '--porcelain'], true);
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  return {
    engine,
    commit: imageCommit(commit, !!dirty),
    version: manifest.version ?? 'dev',
    created: new Date().toISOString(),
    source: 'semantic-workbench',
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter(arg => arg !== '--'),
    allowPositionals: true,
    options: {
      engine: { type: 'string' },
      tag: { type: 'string', multiple: true },
      registry: { type: 'string' },
      ref: { type: 'string' },
      'ref-env': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log('image:build|scan|sbom|push [--engine docker|podman] [--tag tag]');
    console.log('scan: --ref <digest-ref> or --ref-env IMAGE_REF; push: --registry <name>.azurecr.io');
    return;
  }
  if (values['ref-env'] && values['ref-env'] !== 'IMAGE_REF') {
    throw Error('--ref-env supports IMAGE_REF only');
  }
  const ref = values.ref ?? (values['ref-env'] ? process.env.IMAGE_REF : undefined);
  if (values['ref-env'] && !ref) throw Error('Missing IMAGE_REF');
  const action = positionals[0];
  if (positionals.length !== 1 || !['build', 'scan', 'sbom', 'push'].includes(action)) {
    throw Error('Usage: image.ts build|scan|sbom|push');
  }
  const engine = chooseEngine(
    ['docker', 'podman'].filter(name => Bun.which(name)),
    values.engine,
  );
  const context = await readImageContext(engine);
  await mkdir('out/image', { recursive: true });
  if (action === 'build') await command(buildArguments(context, values.tag));
  if (action === 'scan' || action === 'sbom') await scan(action, context, ref);
  if (action === 'push') await push(context, values.registry ?? '');
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
