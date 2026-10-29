// Faults in the folder path check, the sparse-checkout arguments and the partial clone, apart from
// the older inventory. Each tuple is the category, the module, the exact text and its replacement.
const FOLDER = 'src/shared/scm/repository-folder.ts';
const SPARSE = 'src/server/projects/sparse-folder.ts';

/** Deliberate faults in sparse project boundaries and checkout behavior. */
export const sparseMutants: [string, string, string, string][] = [
  ['folder-refusal-reason', 'src/server/projects/project-folder.ts', "throw new BadRequestError(\n      'Choosing a folder", "throw new NotFoundError(\n      'Choosing a folder"],
  ['sparse-folder-path', FOLDER, "segment === '..'", 'false'],
  ['sparse-folder-path', FOLDER, "segment === '.'", 'false'],
  ['sparse-folder-path', FOLDER, "segment === ''", 'false'],
  ['sparse-folder-path', FOLDER, "trimmed.startsWith('/')", 'false'],
  ['sparse-folder-path', FOLDER, '/^[A-Za-z]:/.test(trimmed)', 'false'],
  ['sparse-folder-path', FOLDER, "trimmed.includes('\\\\')", 'false'],
  ['sparse-folder-path', FOLDER, "segment.toLowerCase() === '.git'", "segment === '.git'"],
  ['sparse-folder-path', FOLDER, "segment.startsWith('-')", 'false'],
  ['sparse-folder-path', FOLDER, 'PATTERN_CHARACTERS.test(trimmed)', 'false'],
  ['sparse-folder-path', FOLDER, "trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed", 'trimmed'],
  ['sparse-folder-path', FOLDER, 'if (hasControlCharacter(trimmed))', 'if (false)'],
  ['sparse-folder-path', FOLDER, 'trimmed.length > MAX_FOLDER_LENGTH', 'false'],
  ['sparse-folder-path', FOLDER, "if (typeof input !== 'string')", 'if (false)'],
  ['sparse-checkout-arguments', SPARSE, "['sparse-checkout', 'set', '--cone', '--', ...folders]", "['sparse-checkout', 'set', '--', ...folders]"],
  ['sparse-checkout-arguments', SPARSE, "['sparse-checkout', 'set', '--cone', '--', ...folders]", "['sparse-checkout', 'set', '--cone', ...folders]"],
  ['sparse-checkout-arguments', SPARSE, "new Set<string>([':(glob)*'])", 'new Set<string>()'],
  ['sparse-checkout-arguments', SPARSE, 'specs.add(folder);', ''],
  ['sparse-checkout-arguments', SPARSE, 'depth < parts.length', 'depth <= parts.length'],
  ['sparse-checkout-arguments', SPARSE, 'let depth = 1;', 'let depth = 2;'],
  ['sparse-partial-clone', 'src/server/projects/git.ts', "['--filter=blob:none', '--no-checkout']", "['--no-checkout']"],
  ['sparse-partial-clone', 'src/server/projects/git.ts', "['--filter=blob:none', '--no-checkout']", "['--filter=blob:none']"],
  ['sparse-partial-clone', 'src/server/projects/git.ts', 'options.partial ?', 'true ?'],
];
