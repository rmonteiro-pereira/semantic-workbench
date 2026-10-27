/** Builds literal-safe ignore patterns and appends them using the file's existing line endings. */
// Ignore choices include the literal path and patterns based on its extension or folder.
/** Pairs an ignore pattern with its human-readable choice label. */
export type IgnoreChoice = { pattern: string; label: string };
// Escape wildcards, leading # or !, and trailing spaces so Git treats filenames literally.
/** Escapes Git ignore syntax so a chosen filename is treated literally. */
export function escapeIgnore(text: string) {
  return text
    .replace(/[\\*?[]/g, c => '\\' + c)
    .replace(/^([#!])/, '\\$1')
    .replace(/ $/, '\\ ');
}
/** Offers literal path, extension and folder ignore patterns for a file. */
export function ignoreChoices(path: string): IgnoreChoice[] {
  const parts = path.split('/');
  const name = parts.at(-1)!;
  const dir = parts.slice(0, -1).join('/');
  const out: IgnoreChoice[] = [
    { pattern: '/' + parts.map(escapeIgnore).join('/'), label: `This file (${path})` },
  ];
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    const ext = name.slice(dot + 1);
    out.push({ pattern: '*.' + escapeIgnore(ext), label: `All .${ext} files` });
  }
  if (dir)
    out.push({
      pattern: '/' + dir.split('/').map(escapeIgnore).join('/') + '/',
      label: `The folder ${dir}/`,
    });
  return out;
}

/** Appends a unique pattern using the file's line endings, or returns null if present. */
export function appendIgnore(current: string, pattern: string): string | null {
  if (!pattern.trim() || /[\r\n]/.test(pattern))
    throw Error('A .gitignore entry is one non-empty line.');
  const eol = /\r\n/.test(current) ? '\r\n' : '\n';
  const lines = current.split(/\r?\n/);
  if (lines.includes(pattern)) return null;
  return current + (current && !current.endsWith('\n') ? eol : '') + pattern + eol;
}
// `.gitignore` is plain text: edited in Source, never validated as a model.
/** Checks whether a filename denotes a plain-text Git ignore file. */
export const isGitignore = (filename: string) =>
  filename === '.gitignore' || filename.endsWith('/.gitignore');
