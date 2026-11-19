// Writes the derived Tessera ontology schemas, or with --check reports whether the checked-in files are current.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORTED_BASES } from '../src/shared/tessera/bases';
import { SUPPORTED_REVISIONS } from '../src/shared/tessera/format';
import { REGISTRY } from '../src/shared/tessera/registry';
import { derivedSchemaFileName, derivePartSchema, deriveTesseraSchema, printDerivedSchema } from '../src/shared/tessera/schema-derivation';

const SCHEMAS_FOLDER = 'schemas';

/** Every derived schema the workbench ships, with the file it belongs in. */
export function derivedSchemaFiles(): { path: string; text: string }[] {
  return SUPPORTED_BASES.flatMap(base => [
    ...SUPPORTED_REVISIONS.map(revision => ({ path: join(SCHEMAS_FOLDER, derivedSchemaFileName(base, revision)), text: printDerivedSchema(deriveTesseraSchema(base, REGISTRY, revision)) })),
    { path: join(SCHEMAS_FOLDER, `tessera-part-3-ossie-${base.version}.json`), text: printDerivedSchema(derivePartSchema(base, REGISTRY)) },
  ]);
}

function readIfPresent(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

if (import.meta.main) {
  const checking = process.argv.includes('--check');
  const stale = derivedSchemaFiles().filter(file => readIfPresent(file.path) !== file.text);
  if (checking) {
    for (const file of stale) console.error(`${file.path} is out of date. Run: bun scripts/derive-tessera-schema.ts`);
    process.exit(stale.length ? 1 : 0);
  }
  for (const file of derivedSchemaFiles()) writeFileSync(file.path, file.text);
}
