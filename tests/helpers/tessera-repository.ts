// Builds a temporary Git repository holding one project of Tessera and standard documents, for compiler and command tests.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isolateGit } from './temp-data-dir';

/** The folder inside the repository that holds the project. */
export const PROJECT_FOLDER = 'retail';

/** The Tessera ontology: a note on the root, on a concept and on a relationship. */
export const ONTOLOGY_TEXT = `tessera: 1
version: 0.2.0.dev0
name: Retail
tessera_notes: Owned by the retail data team.
ontology:
  - concept: Order
    type: EntityType
    description: A customer order.
    tessera_notes: Ask finance before adding a Return concept.
    relationships:
      - name: placed_by
        verbalizes:
          - Order is placed by Customer
        roles:
          - concept: Customer
        tessera_notes: Revisit the cardinality after the loyalty launch.
  - concept: Customer
    type: EntityType
    description: A person who buys.
`;

/** A standard semantic model whose metric carries a SEMANTIC_WORKBENCH extension entry. */
export const SEMANTIC_MODEL_TEXT = `version: 0.2.0.dev0
name: retail_model
datasets:
  - name: ORDERS
    source: db.orders
    fields:
      - name: amount
        expression:
          dialects:
            - dialect: ANSI_SQL
              expression: ORDERS.amount
metrics:
  - name: revenue
    expression:
      dialects:
        - dialect: ANSI_SQL
          expression: SUM(ORDERS.amount)
    custom_extensions:
      - vendor_name: SEMANTIC_WORKBENCH
        data: |
          {
            "schema": "semantic-workbench/metric/v1",
            "label": "Revenue",
            "type": "simple",
            "additivity": "additive",
            "unit": "currency",
            "format": "#,##0",
            "owner": "Finance",
            "status": "approved"
          }
`;

/** A standard mapping that names the ontology and the semantic model by logical name. */
export const MAPPING_TEXT = `version: 0.2.0.dev0
name: retail_mapping
ontology_ref:
  name: Retail
semantic_model_ref:
  name: retail_model
concept_mappings: []
`;

/** A data contract that the compiler lists but never compiles. */
export const CONTRACT_TEXT = `apiVersion: v3.1.0
kind: DataContract
id: orders
version: 1.0.0
status: active
schema:
  - name: orders
`;

/** A Turtle file that the compiler lists as not included. */
export const TURTLE_TEXT = '@prefix ex: <http://example.com/> .\nex:order a ex:Thing .\n';

/** The committed project files by their path relative to the repository. */
export const COMMITTED_FILES: Record<string, string> = {
  [`${PROJECT_FOLDER}/ontology.yaml`]: ONTOLOGY_TEXT,
  [`${PROJECT_FOLDER}/semantic-model.yaml`]: SEMANTIC_MODEL_TEXT,
  [`${PROJECT_FOLDER}/mapping.yaml`]: MAPPING_TEXT,
  [`${PROJECT_FOLDER}/contract.odcs.yaml`]: CONTRACT_TEXT,
  [`${PROJECT_FOLDER}/vocabulary.ttl`]: TURTLE_TEXT,
  '.gitignore': 'ignored.yaml\n',
};

/** A temporary repository and the operations the tests need on it. */
export type TesseraRepository = {
  /** The repository folder. */
  directory: string;
  /** The full identifier of the first commit on `main`. */
  firstCommit: string;
  /** Overwrites a file without committing it. */
  editWithoutCommit(path: string, text: string): void;
  /** Creates a branch with one extra commit that changes a note, and returns to `main`. */
  addPersonalBranch(branch: string): string;
  /** Commits a change to `main` and returns the new commit identifier. */
  addSecondCommit(): string;
  /** Writes a file and commits it to `main`, returning the new commit identifier. */
  commitFile(path: string, text: string): string;
  /** Removes the temporary folder. */
  dispose(): void;
};

function git(directory: string, args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: directory, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (result.exitCode !== 0) throw Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

function writeFile(directory: string, path: string, text: string) {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), text);
}

/** Creates the repository with the committed files on `main`, an ignored file and a working tree that matches the commit. */
export function createTesseraRepository(): TesseraRepository {
  isolateGit();
  const base = mkdtempSync(join(tmpdir(), 'tessera-repository-'));
  const directory = join(base, 'repository');
  mkdirSync(directory);
  git(directory, ['init', '-q', '-b', 'main']);
  for (const [path, text] of Object.entries(COMMITTED_FILES)) writeFile(directory, path, text);
  git(directory, ['add', '-A']);
  git(directory, ['commit', '-q', '-m', 'Add the retail project']);
  writeFile(directory, 'ignored.yaml', 'name: ignored\n');
  const firstCommit = git(directory, ['rev-parse', 'HEAD']);
  return {
    directory,
    firstCommit,
    editWithoutCommit: (path, text) => writeFile(directory, path, text),
    addPersonalBranch(branch) {
      git(directory, ['switch', '-q', '-c', branch]);
      writeFile(directory, `${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT.replace('Ask finance before adding a Return concept.', 'A note that only lives on a personal branch.'));
      git(directory, ['commit', '-q', '-am', 'Change a note on a personal branch']);
      const commit = git(directory, ['rev-parse', 'HEAD']);
      git(directory, ['switch', '-q', 'main']);
      return commit;
    },
    addSecondCommit() {
      writeFile(directory, `${PROJECT_FOLDER}/ontology.yaml`, ONTOLOGY_TEXT.replace('A person who buys.', 'A person or company that buys.'));
      git(directory, ['commit', '-q', '-am', 'Describe the customer more broadly']);
      return git(directory, ['rev-parse', 'HEAD']);
    },
    commitFile(path, text) {
      writeFile(directory, path, text);
      git(directory, ['add', '--', path]);
      git(directory, ['commit', '-q', '-m', `Change ${path}`]);
      return git(directory, ['rev-parse', 'HEAD']);
    },
    dispose: () => rmSync(base, { recursive: true, force: true }),
  };
}
