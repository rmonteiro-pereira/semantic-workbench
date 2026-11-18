// Turns the result of a compile into the flat list of findings that people and programs read, the same way for every entry point.
import type { CompileResult } from './compile-unit';

/** The finding of one document as an entry point lists it. */
export type CompileFinding = { document: string; severity: string; code: string; path: string; line?: number; column?: number; message: string };

/** Lists the findings of every document, then the failures that no document finding already says. */
export function compileFindings(compile: CompileResult | null): CompileFinding[] {
  const findings: CompileFinding[] = [];
  for (const entry of compile?.findings ?? []) {
    for (const issue of entry.issues)
      findings.push({ document: entry.document, severity: issue.severity, code: issue.code, path: issue.path, line: issue.line, column: issue.column, message: issue.message });
  }
  for (const failure of compile?.failures ?? []) {
    if (failure.code !== 'invalid-source') findings.push({ document: failure.document ?? '', severity: 'error', code: failure.code, path: '/', message: failure.message });
  }
  return findings;
}
