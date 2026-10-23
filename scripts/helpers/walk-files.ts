// Lists the files under some paths, for the checks that scan the source tree.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Returns the files under the given paths that the filter accepts, skipping node_modules. */
export function walkFiles(paths: string[], accept: (file: string) => boolean): string[] {
  const found: string[] = [];
  const visit = (path: string) => {
    if (statSync(path).isFile()) {
      if (accept(path)) found.push(path);
      return;
    }
    for (const entry of readdirSync(path)) {
      if (entry !== 'node_modules') visit(join(path, entry));
    }
  };
  for (const path of paths) visit(path);
  return found;
}
