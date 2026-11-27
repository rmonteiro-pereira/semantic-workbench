import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { recordFiles } from './data';

const directory = 'tests/fixtures/auth-workspace/projects';
mkdirSync(process.env.JOURNEY_OUTPUT!, { recursive: true });

function definitions(root: string): { path: string; source: string }[] {
  return readdirSync(root).flatMap(name => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return definitions(path);
    return [{ path, source: readFileSync(path, 'utf8') }];
  });
}

recordFiles(definitions(directory), 'auth-fixture-catalog');
