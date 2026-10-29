// Checks source comments for planning identifiers that belong in documentation instead.
import ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Run with directory arguments, or omit them to check source, scripts and tests.

const ID_PATTERNS: [RegExp, string][] = [
  [/\b(?:FR|NFR|SC)-\d+/, 'requirement or success-criterion ID'],
  [/\bT\d{3}\b/, 'task ID'],
  [/\bUS\d+\b/, 'user-story ID'],
  [/\bR\d{1,2}\b(?!\s*[×x]\s*\d)/, 'research-decision ID'],
  [/\b[Pp]hase \d+\b/, 'planning phase number'],
];

const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs)$/;

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (path.replaceAll('\\', '/') === 'src/generated/validators.js') continue;
    if (entry === 'node_modules' || entry === 'fixtures') continue;
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (SOURCE.test(entry)) files.push(path);
  }
  return files;
}

/** Returns every comment of a file with its 1-based line number. */
function commentsOf(path: string): { line: number; text: string }[] {
  const text = readFileSync(path, 'utf8');
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Map<number, string>();
  const collect = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) found.set(range.pos, text.slice(range.pos, range.end));
  };
  // Comments sit in the trivia before or after a token; visiting every token finds them all, and
  // never mistakes `//` inside a string, template or regular expression for a comment.
  const visit = (node: ts.Node) => {
    if (node.kind >= ts.SyntaxKind.FirstToken && node.kind <= ts.SyntaxKind.LastToken) {
      collect(ts.getLeadingCommentRanges(text, node.getFullStart()));
      collect(ts.getTrailingCommentRanges(text, node.getEnd()));
    }
    for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return [...found.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([pos, comment]) => ({
      line: source.getLineAndCharacterOfPosition(pos).line + 1,
      text: comment,
    }));
}

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'scripts', 'tests'];
const problems: string[] = [];
for (const file of dirs.flatMap(sourceFiles)) {
  if (file.endsWith('check-comments.ts')) continue;
  for (const comment of commentsOf(file)) {
    for (const [pattern, what] of ID_PATTERNS) {
      const match = pattern.exec(comment.text);
      if (match) problems.push(`${file}:${comment.line}: ${what} "${match[0]}" in a comment`);
    }
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(
    `\n${problems.length} comments name specification or task IDs. Explain the code in plain words instead.`,
  );
  process.exit(1);
}
console.log('Comments are free of specification and task IDs.');
