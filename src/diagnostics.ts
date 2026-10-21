export type Issue = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  path: string;
  message: string;
  line?: number;
  column?: number;
  innerPath?: string;
};
export class InputError extends Error {
  constructor(public issues: Issue[]) {
    super(issues.map(i => `${i.path}: ${i.message}`).join('\n'));
    this.name = 'InputError';
  }
}
export function rejectIssues(issues: Issue[]) {
  if (issues.some(i => i.severity === 'error')) throw new InputError(issues);
}
export const MAX_INPUT_BYTES = 2_000_000;
export function validateEnvelope(source: string, filename: string) {
  const issues: Issue[] = [];
  const fail = (code: string, message: string) =>
    issues.push({ severity: 'error', code, path: '/', message });
  if (
    typeof filename !== 'string' ||
    !filename.trim() ||
    filename.length > 255 ||
    // Control characters are rejected on purpose: they never belong in a file name.
    // oxlint-disable-next-line no-control-regex
    /[\x00-\x1f/\\]/.test(filename)
  )
    fail(
      'filename',
      'Use a filename of 1–255 characters without directory separators or control characters.',
    );
  if (typeof source !== 'string' || !source.trim())
    fail('empty', 'The definition is empty. Paste or choose a supported definition.');
  else if (new TextEncoder().encode(source).length > MAX_INPUT_BYTES)
    fail('size', 'The definition exceeds the 2 MB UTF-8 limit. Split it into smaller documents.');
  rejectIssues(issues);
}
