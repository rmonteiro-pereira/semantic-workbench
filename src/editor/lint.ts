/** Maps findings to editor ranges and requests validation from a shared worker. */
import type { Text } from '@codemirror/state';
import type { Diagnostic } from '@codemirror/lint';
import type { Issue } from '../diagnostics';
import { timeOperation } from '../observability/page-reporting';
// Findings → editor diagnostics. A finding with a line (and column) becomes a range from that
// position to the end of the token there; one without a reliable location stays document-level and
// is listed above the editor instead of being drawn on a guessed line.
/** Returns a finding's token range, or null when its location is unreliable. */
export function issueRange(issue: Issue, doc: Text): { from: number; to: number } | null {
  if (!issue.line || issue.line < 1 || issue.line > doc.lines) return null;
  const line = doc.line(issue.line);
  const column = Math.max(1, issue.column ?? 1);
  const from = Math.min(line.to, line.from + column - 1);
  const rest = doc.sliceString(from, line.to);
  const token = rest.match(/^\s*\S+/)?.[0].length ?? 0;
  return { from, to: token ? from + token : line.to };
}
/** Converts located validation findings into CodeMirror diagnostics. */
export function toDiagnostics(issues: Issue[], doc: Text) {
  const diagnostics: Diagnostic[] = [];
  const documentLevel: Issue[] = [];
  for (const issue of issues) {
    const range = issueRange(issue, doc);
    if (!range) {
      documentLevel.push(issue);
      continue;
    }
    diagnostics.push({
      ...range,
      severity: issue.severity,
      source: issue.code,
      message: issue.message,
    });
  }
  return { diagnostics, documentLevel };
}
/** What the status bar says about the findings drawn in the editor. */
export type FindingSummary = {
  count: number;
  line: number;
  severity: Diagnostic['severity'];
  message: string;
};
/** Picks the finding to name in the status bar: the first error, else the first in the file. */
export function summarizeDiagnostics(diagnostics: Diagnostic[], doc: Text): FindingSummary | null {
  if (!diagnostics.length) return null;
  const byPosition = [...diagnostics].sort((a, b) => a.from - b.from);
  const first = byPosition.find(d => d.severity === 'error') ?? byPosition[0]!;
  return {
    count: diagnostics.length,
    line: doc.lineAt(first.from).number,
    severity: first.severity,
    message: first.message,
  };
}
// Validation runs in a worker: one shared worker, requests answered by id; a newer request for the
// same editor supersedes an older one.
type Pending = { resolve: (issues: Issue[]) => void };
let worker: Worker | null = null;
let next = 0;
const pending = new Map<number, Pending>();
function post(message: Record<string, unknown>): Promise<Issue[]> {
  if (!worker) {
    worker = new Worker(new URL('./lint.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      pending.delete(data.id);
      p?.resolve(data.issues);
    };
  }
  const id = ++next;
  return new Promise(resolve => {
    pending.set(id, { resolve });
    worker!.postMessage({ id, ...message });
  });
}
/** Requests document validation from the shared worker. */
export const validateInWorker = (source: string, filename: string) =>
  timeOperation('validation', post({ source, filename }));

/** Requests SQL field warnings with positions relative to the supplied text. */
export const lintSqlInWorker = (sql: string, dialect: string | null) =>
  post({ sql, dialect, source: '', filename: '' });
