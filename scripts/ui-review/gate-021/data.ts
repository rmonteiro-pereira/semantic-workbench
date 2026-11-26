import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { inspect } from '../../../src/shared/core/model';
import { exampleSet } from '../../../src/shared/projects/examples';

/** Records the exact definition bytes supplied to the disposable workspace. */
export function recordFiles(files: { path: string; source: string }[], operation: string) {
  const records = files.map(file => {
    let counts: unknown;
    try {
      const model = inspect(file.source, basename(file.path));
      counts = { entities: model.entities.length, relationships: model.relationships.length };
    } catch (error) {
      counts = { error: String(error).slice(0, 200) };
    }
    return { path: file.path, hash: createHash('sha256').update(file.source).digest('hex'), counts };
  });
  appendFileSync(`${process.env.JOURNEY_OUTPUT}/loads.jsonl`, JSON.stringify({ operation, files: records }) + '\n');
}

/** Records the built-in files selected by a journey's example load. */
export function recordExample(name: string) {
  const set = exampleSet(name)!;
  const directory = join('public/examples', set.folder);
  try {
    const files = set.files.map(path => ({ path, source: readFileSync(join(directory, path), 'utf8') }));
    recordFiles(files, `example:${name}`);
  } catch (error) {
    appendFileSync(`${process.env.JOURNEY_OUTPUT}/loads.jsonl`, JSON.stringify({ operation: `example:${name}`, error: String(error) }) + '\n');
  }
}

function definitionFiles(directory: string, prefix = ''): { path: string; source: string }[] {
  return readdirSync(directory).flatMap(name => {
    if (name === '.git') return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return definitionFiles(path, `${prefix}${name}/`);
    if (!/\.(yaml|json|ttl|cedar)$/.test(name)) return [];
    return [{ path: `${prefix}${name}`, source: readFileSync(path, 'utf8') }];
  });
}

/** Records the project definitions and prepared administration fixture before server startup. */
export function recordAuthFixture(root: string) {
  recordFiles(definitionFiles('tests/fixtures/auth-workspace/projects'), 'auth-fixture');
  recordFiles(definitionFiles(join(root, 'admin')), 'admin-configuration');
}
