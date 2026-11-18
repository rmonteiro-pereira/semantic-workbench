// Records what the workbench does with ordinary Ossie and ODCS files today, so a test can prove later work leaves it unchanged.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatAddress } from '../src/shared/core/item-address';
import { validateInput } from '../src/shared/validation/input';
import { agentCatalog, buildContext, type StoredDocument } from '../src/server/agent/context';

/** The folders whose documents form the recorded baseline. */
export const BASELINE_FOLDERS = ['public/examples', 'tests/fixtures/ossie-mapping', 'tests/fixtures/addresses', 'tests/fixtures/agent-context'];

/** Where the recorded baseline is stored. */
export const BASELINE_FILE = 'tests/fixtures/tessera/standard-baseline.json';

const DOCUMENT_EXTENSIONS = ['.yaml', '.yml', '.json'];

/** What a document looks like to the workbench: its findings and its inspected items. */
export type DocumentRecord = {
  valid: boolean;
  issues: { severity: string; code: string; path: string; message: string; line?: number; column?: number }[];
  kind?: string;
  layout?: string;
  entityIds?: string[];
  edgeIds?: string[];
  addresses?: string[];
};

/** The recorded baseline: one record per document and one digest per mapping context. */
export type StandardBaseline = {
  documents: Record<string, DocumentRecord>;
  agentContexts: Record<string, string>;
};

function listDocuments(folder: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) found.push(...listDocuments(path));
    else if (DOCUMENT_EXTENSIONS.some(extension => name.endsWith(extension))) found.push(path);
  }
  return found;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stableJson((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Describes one document the way the editor, the scanner and the save path see it. */
export function describeDocument(source: string, filename: string): DocumentRecord {
  const result = validateInput(source, filename);
  const issues = result.issues.map(issue => ({ severity: issue.severity, code: issue.code, path: issue.path, message: issue.message, line: issue.line, column: issue.column }));
  if (!result.valid) return { valid: false, issues };
  const model = result.model;
  const items = [...model.entities, ...model.edges];
  const addresses = items.filter(item => 'address' in item).map(item => formatAddress((item as { address: Parameters<typeof formatAddress>[0] }).address));
  return {
    valid: true,
    issues,
    kind: model.kind,
    layout: model.layout,
    entityIds: model.entities.map(entity => entity.id),
    edgeIds: model.edges.map(edge => edge.id),
    addresses,
  };
}

/** Builds the agent context digest of every mapping found among the documents of one folder. */
function contextDigests(folder: string, files: string[]): Record<string, string> {
  const documents: StoredDocument[] = files.map(file => ({ id: relative(folder, file), filename: file.split('/').at(-1)!, source: readFileSync(file, 'utf8'), revision: 1 }));
  const digests: Record<string, string> = {};
  for (const mapping of agentCatalog(documents).mappings) {
    const context = buildContext(documents, mapping.id);
    digests[`${folder}:${mapping.id}`] = createHash('sha256')
      .update(JSON.stringify(stableJson(context)))
      .digest('hex');
  }
  return digests;
}

/** Records the baseline for every folder. */
export function recordBaseline(): StandardBaseline {
  const baseline: StandardBaseline = { documents: {}, agentContexts: {} };
  for (const folder of BASELINE_FOLDERS) {
    const files = listDocuments(folder);
    for (const file of files) baseline.documents[file] = describeDocument(readFileSync(file, 'utf8'), file.split('/').at(-1)!);
    const folders = new Set(files.map(file => file.slice(0, file.lastIndexOf('/'))));
    for (const group of [...folders].sort())
      Object.assign(
        baseline.agentContexts,
        contextDigests(
          group,
          files.filter(file => file.startsWith(group + '/') && !file.slice(group.length + 1).includes('/')),
        ),
      );
  }
  return baseline;
}

/** Prints one line per document and per digest so a change shows as a small diff. */
export function printBaseline(baseline: StandardBaseline): string {
  const lines = (entries: Record<string, unknown>) =>
    Object.entries(entries)
      .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      .join(',\n');
  return `{\n "documents": {\n${lines(baseline.documents)}\n },\n "agentContexts": {\n${lines(baseline.agentContexts)}\n }\n}\n`;
}

if (import.meta.main) {
  writeFileSync(BASELINE_FILE, printBaseline(recordBaseline()));
  console.log(`Wrote ${BASELINE_FILE}`);
}
