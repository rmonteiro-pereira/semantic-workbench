// Builds temporary local Git remotes for clone, monorepo and unsafe-path tests.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isolateGit } from './temp-data-dir';
// Local bare repositories for clone and monorepo tests: built in a temporary folder from a scratch
// working tree, never a network remote or the owner's repositories.
/** Describes a temporary bare repository and the files used to create it. */
export type BareFixture = {
  bare: string;
  dir: string;
  files: Record<string, string>;
  dispose(): void;
};
/** Selects the repository layout or unsafe-path fixture to generate. */
export type FixtureKind = 'monorepo' | 'monorepo-no-manifest' | 'hazards' | 'single';
const git = (cwd: string, args: string[]) => {
  const r = Bun.spawnSync(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (r.exitCode !== 0) throw Error(`git ${args.join(' ')}: ${r.stderr.toString()}`);
  return r.stdout.toString();
};
/** Builds ontology text from the supplied name and concepts. */
export const ontologyText = (name: string, concepts: string[]) =>
  `name: ${name}\nontology:\n${concepts.map(c => `  - concept: ${c}\n    type: EntityType\n    description: ${c} of ${name}.\n`).join('')}`;
/** Defines project folders for the monorepo fixture. */
export const MANIFEST = {
  schema: 'semantic-workbench/repository/v1',
  projects: [
    { path: 'domains/sales', name: 'Sales' },
    { path: 'domains/finance', name: 'Finance' },
  ],
};
/** Returns files for the selected repository fixture layout. */
export function fixtureFiles(kind: FixtureKind): Record<string, string> {
  const sales = {
    'domains/sales/sales.ontology.yaml': ontologyText('Sales', ['Customer', 'Order']),
  };
  const finance = {
    'domains/finance/finance.ontology.yaml': ontologyText('Finance', ['Invoice', 'Payment']),
  };
  switch (kind) {
    case 'monorepo':
      return {
        ...sales,
        ...finance,
        '.semantic-workbench.json': JSON.stringify(MANIFEST, null, 2) + '\n',
        'README.md': 'Team repository.\n',
      };
    case 'monorepo-no-manifest':
      return {
        ...sales,
        ...finance,
        'README.md': 'Team repository.\n',
        'docs/notes.txt': 'Not a definition.\n',
      };
    case 'hazards':
      return {
        'shop.ontology.yaml': ontologyText('Shop', ['Customer']),
        'big.ontology.yaml': `name: Big\ndescription: ${'x'.repeat(2_100_000)}\n`,
        'notes.txt': 'Unsupported file.\n',
      };
    case 'single':
      return { 'shop.ontology.yaml': ontologyText('Shop', ['Customer', 'Order']) };
  }
}
// A bare repository whose single commit on `main` holds the fixture files. `hazards` adds a
// symbolic link pointing outside the repository (committed as a link).
/** Creates a disposable bare repository with one main-branch commit for the selected fixture. */
export function bareRepository(kind: FixtureKind): BareFixture {
  isolateGit();
  const dir = mkdtempSync(join(tmpdir(), 'workbench-gitfix-'));
  const work = join(dir, 'work');
  const bare = join(dir, `${kind}.git`);
  mkdirSync(work);
  git(work, ['init', '-q', '-b', 'main']);
  const files = fixtureFiles(kind);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(work, path)), { recursive: true });
    writeFileSync(join(work, path), text);
  }
  if (kind === 'hazards') symlinkSync('/etc/hostname', join(work, 'linked.ontology.yaml'));
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '-m', 'Fixture']);
  git(dir, ['clone', '-q', '--bare', work, bare]);
  return { bare, dir, files, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}
