// Builds a workspace for the compile tests: a published project that holds Tessera and standard files, a second project that was never published, a hidden file and a set of people.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAccessControl } from '../../src/server/auth/authorize';
import { LOCAL_READER, type Reader } from '../../src/server/projects/reader';
import { boundaryReader, accessFixture, person } from '../auth/access-fixture';
import { authWorkspace } from './auth-workspace';
import { publishFixture } from './published-workspace';
import { CONTRACT_TEXT, MAPPING_TEXT, ONTOLOGY_TEXT, SEMANTIC_MODEL_TEXT } from './tessera-repository';

/** The project that is published: a sales project of the access fixture, which also holds a folder only Finance may read. */
export const COMPILE_PROJECT = 'sales-contracts';

/** The file a reader outside Finance may not read. */
export const HIDDEN_FILE = 'finance/revenue-recognition.odcs.yaml';

/** The Tessera ontology of the fixture. */
export const ONTOLOGY_PATH = 'retail.ontology.yaml';

/** The files added to the project before it is published, by path. */
export const TESSERA_FILES: Record<string, string> = {
  [ONTOLOGY_PATH]: ONTOLOGY_TEXT,
  'retail.semantic.yaml': SEMANTIC_MODEL_TEXT,
  'retail.mapping.yaml': MAPPING_TEXT,
  'retail.contract.odcs.yaml': CONTRACT_TEXT,
};

/** A person of the access fixture, by the role that matters to compile: sales editor, sales steward, viewer of another domain, workspace admin. */
export type CompilePerson = 'alice' | 'bob' | 'carol' | 'dave' | 'frank';

/** Reads the project as the person would, with the access view of the fixture. */
export function readerFor(name: CompilePerson): Reader {
  const access = createAccessControl(accessFixture());
  const principal = access.principalFor(person(name));
  return boundaryReader(access.view(principal), principal.id);
}

/** Opens the workspace, publishes it and adds a project that has no snapshot. */
export async function compileWorkspace() {
  const fixture = await authWorkspace({ published: false });
  for (const [path, source] of Object.entries(TESSERA_FILES)) await fixture.ws.saveFile(COMPILE_PROJECT, path, { baseHash: null, source }, LOCAL_READER);
  await publishFixture(fixture);
  const unpublished = await fixture.seed([{ path: 'notes.ontology.yaml', source: ONTOLOGY_TEXT }], 'draft-notes');
  return {
    fixture,
    get ws() {
      return fixture.ws;
    },
    project: COMPILE_PROJECT,
    unpublishedProject: unpublished.slug,
    /** Saves a change to the working copy of the published project without committing or publishing it. */
    async editWorkingCopy(path: string, source: string) {
      const current = (() => {
        try {
          return fixture.ws.readFile(COMPILE_PROJECT, path, LOCAL_READER).hash;
        } catch {
          return null;
        }
      })();
      await fixture.ws.saveFile(COMPILE_PROJECT, path, { baseHash: current, source }, LOCAL_READER);
    },
    [Symbol.dispose]() {
      fixture.dispose();
    },
  };
}

/** What the command line produced: its exit status and every file of the bundle by path. */
export type CommandLineBundle = { status: number; stdout: string; files: Map<string, Uint8Array> };

function readFilesBelow(folder: string, prefix = '', found = new Map<string, Uint8Array>()) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) readFilesBelow(join(folder, entry.name), path, found);
    else found.set(path, new Uint8Array(readFileSync(join(folder, entry.name))));
  }
  return found;
}

/** Runs `bun run tessera compile` on the committed snapshot of the project and reads the bundle it wrote. */
export function compileWithCommandLine(
  workspace: { ws: { repoOf(slug: string): string }; fixture: { root: string } },
  project: string,
  options: { acceptLoss?: string; commit?: string } = {},
): CommandLineBundle {
  const base = mkdtempSync(join(tmpdir(), 'compile-cli-'));
  try {
    const repository = join(workspace.fixture.root, 'projects', workspace.ws.repoOf(project));
    const args = ['scripts/tessera.ts', 'compile', '--repository', repository, '--data-root', workspace.fixture.root, '--out', join(base, 'bundle')];
    if (options.acceptLoss) args.push('--accept-loss', options.acceptLoss);
    if (options.commit) args.push('--commit', options.commit);
    const result = Bun.spawnSync(['bun', ...args], { cwd: process.cwd(), env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    const bundle = join(base, 'bundle');
    return { status: result.exitCode, stdout: result.stdout.toString(), files: existsSync(bundle) ? readFilesBelow(bundle) : new Map() };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** The digest the command line prints when a compile needs acceptance. */
export function digestFromCommandLine(workspace: Parameters<typeof compileWithCommandLine>[0], project: string): string {
  const refused = compileWithCommandLine(workspace, project);
  const digest = refused.stdout.match(/Digest: (sha256:[0-9a-f]{64})/)?.[1];
  if (!digest) throw new Error('The command line printed no digest: ' + refused.stdout);
  return digest;
}
