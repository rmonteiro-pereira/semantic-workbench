// "Add to .gitignore" (FR-093): the exact path, or a pattern derived from it (its extension, its
// folder), written so Git reads it literally; and appending one entry to the file's text.
export type IgnoreChoice = { pattern: string; label: string };
// Escape what .gitignore would otherwise read as syntax: wildcards, a leading # or !, trailing spaces.
export function escapeIgnore(text: string) {
  return text
    .replace(/[\\*?[]/g, c => '\\' + c)
    .replace(/^([#!])/, '\\$1')
    .replace(/ $/, '\\ ');
}
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
// The file's text with `pattern` on its own line at the end, in the file's line-ending style.
// Returns null when the exact line is already there.
export function appendIgnore(current: string, pattern: string): string | null {
  if (!pattern.trim() || /[\r\n]/.test(pattern))
    throw Error('A .gitignore entry is one non-empty line.');
  const eol = /\r\n/.test(current) ? '\r\n' : '\n';
  const lines = current.split(/\r?\n/);
  if (lines.includes(pattern)) return null;
  return current + (current && !current.endsWith('\n') ? eol : '') + pattern + eol;
}
// `.gitignore` is plain text: edited in Source, never validated as a model (FR-094).
export const isGitignore = (filename: string) =>
  filename === '.gitignore' || filename.endsWith('/.gitignore');
