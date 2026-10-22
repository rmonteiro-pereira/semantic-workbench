import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { validateTarget } from './image';

/** Parsed release precedence, excluding build metadata. */
export type ReleaseVersion = { core: number[]; prerelease: string[] };

/** Parses a release tag using SemVer numeric and prerelease rules. */
export function parseRelease(tag: string): ReleaseVersion {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/.exec(tag);
  if (!match) throw Error(`Invalid release tag: ${tag}`);
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some(part => !/^[0-9A-Za-z-]+$/.test(part) || /^0\d+$/.test(part))) {
    throw Error(`Invalid release prerelease: ${tag}`);
  }
  const core = match.slice(1, 4).map(Number);
  if (core.some(value => !Number.isSafeInteger(value)))
    throw Error(`Release number too large: ${tag}`);
  return { core, prerelease };
}

function compareIdentifier(left: string, right: string): number {
  if (left === right) return 0;
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return BigInt(left) > BigInt(right) ? 1 : -1;
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left > right ? 1 : -1;
}

/** Compares release tags without lexicographic mistakes in numeric prereleases. */
export function compareReleases(left: string, right: string): number {
  const first = parseRelease(left);
  const second = parseRelease(right);
  for (let index = 0; index < 3; index++) {
    if (first.core[index] !== second.core[index]) return first.core[index] - second.core[index];
  }
  if (!first.prerelease.length && !second.prerelease.length) return 0;
  if (!first.prerelease.length) return 1;
  if (!second.prerelease.length) return -1;
  const length = Math.max(first.prerelease.length, second.prerelease.length);
  for (let index = 0; index < length; index++) {
    if (first.prerelease[index] === undefined) return -1;
    if (second.prerelease[index] === undefined) return 1;
    const order = compareIdentifier(first.prerelease[index], second.prerelease[index]);
    if (order !== 0) return order;
  }
  return 0;
}

/** Refuses a mismatched package core or a tag older than any promoted version. */
export function checkReleaseVersion(tag: string, packageVersion: unknown, registryTags: string[]) {
  const release = parseRelease(tag);
  if (typeof packageVersion !== 'string')
    throw Error('package.json must declare a release version');
  const manifest = parseRelease(`v${packageVersion}`);
  if (release.core.join('.') !== manifest.core.join('.')) {
    throw Error(`Tag ${tag} does not match package.json version ${packageVersion}`);
  }
  for (const promoted of registryTags.filter(value => value.startsWith('v'))) {
    if (compareReleases(tag, promoted) < 0)
      throw Error(`${tag} is older than promoted ${promoted}`);
  }
}

/** Builds the read-only registry query used before tag publication. */
export function versionQuery(registry: string): string[] {
  if (!/^[a-zA-Z0-9]{5,50}$/.test(registry)) throw Error(`Invalid ACR_NAME: ${registry}`);
  return [
    'az',
    'acr',
    'repository',
    'show-tags',
    '--name',
    registry,
    '--repository',
    'semantic-workbench',
    '--output',
    'json',
  ];
}

/** Resolves an explicit local tag or the pipeline ref before any authenticated command. */
export function releaseTag(tag: string | undefined, sourceRef: string | undefined): string {
  const selected = tag ?? sourceRef?.replace(/^refs\/tags\//, '') ?? '';
  parseRelease(selected);
  return selected;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter(arg => arg !== '--'),
    options: { tag: { type: 'string' }, fake: { type: 'boolean' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log('deploy:check-version [--tag vX.Y.Z] [--fake]; defaults to SOURCE_REF');
    return;
  }
  const tag = releaseTag(values.tag, process.env.SOURCE_REF);
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  checkReleaseVersion(tag, manifest.version, []);
  const target = validateTarget(process.env);
  const args = versionQuery(target.ACR_NAME);
  if (values.fake) {
    checkReleaseVersion(tag, manifest.version, []);
    console.log(`Offline version check passed: ${tag} (empty fake registry)`);
    return;
  }
  const child = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  // A new registry has no repository yet; authentication and network failures still fail closed.
  if (code !== 0 && !/\bNAME_UNKNOWN\b/.test(error))
    throw Error(`Registry version query failed: ${error}`);
  const tags: unknown = code === 0 ? JSON.parse(output) : [];
  if (!Array.isArray(tags) || tags.some(value => typeof value !== 'string')) {
    throw Error('Registry returned an invalid tag list');
  }
  checkReleaseVersion(tag, manifest.version, tags);
  console.log(`Release version check passed: ${tag}`);
}

if (import.meta.main) {
  await main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
