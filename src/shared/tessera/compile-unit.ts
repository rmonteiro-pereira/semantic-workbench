// Compiles one project folder: validates every Ossie document, compiles the Tessera ones, copies the rest of the Ossie files and checks the whole result before anything is released.
import type { Issue } from '../validation/diagnostics';
import { validateInput } from '../validation/input';
import { OSSIE_SCHEMA_VERSION, isNotValidated } from '../validation/validation';
import { compareText } from './canonical-json';
import { compileDocument, type CompileFailure } from './compile-document';
import { sha256Hex } from './digest';
import { classifyFile, type ClassifiedFile, type UnitFile } from './document-kind';
import { COMPILER_NAME, COMPILER_VERSION } from './format';
import { buildLossReport, type LossEntry, type LossReport, type ReportInput, type ReportOutput } from './loss-report';
import { documentMeaningFailures, summarizeItems, unitMeaningFailures, type DocumentReading } from './meaning-check';
import { SUPPORTED_BASES, findBase } from './bases';
import { REGISTRY } from './registry';

export type { UnitFile } from './document-kind';

/** The most a unit may hold, so a compile is bounded before any file is parsed. */
export const UNIT_LIMITS: Readonly<{ files: number; totalBytes: number; documentBytes: number }> = { files: 10_000, totalBytes: 64_000_000, documentBytes: 2_000_000 };

/** Options that become part of the report, because they change what may be released. */
export type CompileOptions = { lossPolicySha256: string | null };

/** The findings of one document. */
export type FileFindings = { document: string; issues: Issue[] };

/** The result of compiling a unit. Output may be released only when there are no failures and the loss is accepted. */
export type CompileResult = {
  outputs: UnitFile[];
  report: LossReport;
  failures: CompileFailure[];
  findings: FileFindings[];
  tesseraRevisions: number[];
};

const encoder = new TextEncoder();

/** What happens to a file of each kind. A refused file is listed as not included, because nothing is written for it. */
const TREATMENT_OF_KIND: Record<ClassifiedFile['kind'], ReportInput['treatment']> = {
  'tessera-ontology': 'compiled',
  ossie: 'copied',
  other: 'not-included',
  invalid: 'not-included',
};

/** The steps a unit compile delegates, so a test can replace one to inject a fault. */
export type UnitSteps = { compileDocument: typeof compileDocument };

const DEFAULT_STEPS: UnitSteps = { compileDocument };

function limitFailures(files: UnitFile[]): CompileFailure[] {
  const failures: CompileFailure[] = [];
  if (files.length > UNIT_LIMITS.files) failures.push({ code: 'limit', message: `The unit holds ${files.length} files, and the limit is ${UNIT_LIMITS.files}.` });
  const total = files.reduce((sum, file) => sum + file.bytes.length, 0);
  if (total > UNIT_LIMITS.totalBytes) failures.push({ code: 'limit', message: `The unit holds ${total} bytes, and the limit is ${UNIT_LIMITS.totalBytes}.` });
  for (const file of files) {
    if (file.bytes.length > UNIT_LIMITS.documentBytes)
      failures.push({ code: 'limit', document: file.path, message: `The file holds ${file.bytes.length} bytes, and the limit is ${UNIT_LIMITS.documentBytes}.` });
  }
  return failures;
}

function collisionFailures(outputs: UnitFile[]): CompileFailure[] {
  const seen = new Map<string, string>();
  const failures: CompileFailure[] = [];
  for (const output of outputs) {
    const key = output.path.toLowerCase();
    const earlier = seen.get(key);
    if (earlier !== undefined)
      failures.push({ code: 'path-collision', document: output.path, message: `${output.path} would be written to the same place as ${earlier}, which differs only in case or is the same path.` });
    else seen.set(key, output.path);
  }
  return failures;
}

type OutputCheck = { failures: CompileFailure[]; reading: DocumentReading | null };

/** Reads the finding of a document that would be released: it passes the pinned schema and rules with no "not validated" notice. */
function outputSchemaFailures(path: string, result: ReturnType<typeof validateInput>): CompileFailure[] {
  const errors = result.issues.filter(issue => issue.severity === 'error').map(issue => ({ code: 'output-schema' as const, document: path, message: `${issue.path}: ${issue.message}` }));
  const notices = result.issues
    .filter(isNotValidated)
    .map(() => ({ code: 'output-schema' as const, document: path, message: 'The document was not validated against the pinned schema, so it cannot be released.' }));
  return [...errors, ...notices];
}

/** Validates the text of an output once and keeps what the meaning check needs from that reading. */
function checkOutput(path: string, text: string, data: unknown): OutputCheck {
  const result = validateInput(text, path.split('/').at(-1)!);
  const failures = outputSchemaFailures(path, result);
  return { failures, reading: result.valid ? { path, source: text, data, summary: summarizeItems(result.model) } : null };
}

type Compiled = { outputs: UnitFile[]; losses: LossEntry[]; failures: CompileFailure[]; treatments: Map<string, ReportInput['treatment']> };

/** Compiles a Tessera ontology and checks its output against its source. */
function compileOntology(entry: Extract<ClassifiedFile, { kind: 'tessera-ontology' }>, steps: UnitSteps, result: Compiled, readings: { sources: DocumentReading[]; outputs: DocumentReading[] }) {
  const compiled = steps.compileDocument({ path: entry.file.path, source: entry.text }, REGISTRY, entry.parsed);
  if (!compiled.ok) {
    result.failures.push(...compiled.failures);
    return;
  }
  result.outputs.push({ path: entry.file.path, bytes: encoder.encode(compiled.text) });
  result.losses.push(...compiled.losses);
  const checked = checkOutput(entry.file.path, compiled.text, compiled.data);
  result.failures.push(...checked.failures);
  if (!checked.reading) return;
  readings.sources.push(entry.reading);
  readings.outputs.push(checked.reading);
  result.failures.push(...documentMeaningFailures(entry.reading, checked.reading));
}

function compileFiles(classified: ClassifiedFile[], steps: UnitSteps): Compiled {
  const result: Compiled = { outputs: [], losses: [], failures: [], treatments: new Map() };
  const readings = { sources: [] as DocumentReading[], outputs: [] as DocumentReading[] };
  for (const entry of classified) {
    result.treatments.set(entry.file.path, TREATMENT_OF_KIND[entry.kind]);
    if (entry.kind === 'invalid') result.failures.push(...entry.failures);
    if (entry.kind === 'ossie') {
      result.outputs.push(entry.file);
      readings.sources.push(entry.reading);
      readings.outputs.push(entry.reading);
      result.failures.push(
        ...entry.issues
          .filter(isNotValidated)
          .map(() => ({ code: 'output-schema' as const, document: entry.file.path, message: 'The document was not validated against the pinned schema, so it cannot be released.' })),
      );
    }
    if (entry.kind === 'tessera-ontology') compileOntology(entry, steps, result, readings);
  }
  if (!result.failures.length) result.failures.push(...unitMeaningFailures(readings.sources, readings.outputs));
  return result;
}

function byFailureOrder(first: CompileFailure, second: CompileFailure): number {
  return compareText(first.document ?? '', second.document ?? '') || compareText(first.code, second.code) || compareText(first.message, second.message);
}

/** Compiles a project folder. Input order never changes the result. */
export function compileUnit(files: UnitFile[], options: CompileOptions, steps: UnitSteps = DEFAULT_STEPS): CompileResult {
  const sorted = [...files].sort((first, second) => compareText(first.path, second.path));
  const limits = limitFailures(sorted);
  const base = findBase(SUPPORTED_BASES, OSSIE_SCHEMA_VERSION)!;
  const empty = { outputs: [], losses: [], failures: [], treatments: new Map() } as Compiled;
  const classified = limits.length ? [] : sorted.map(classifyFile);
  const compiled = limits.length ? empty : compileFiles(classified, steps);
  const collisions = collisionFailures(compiled.outputs);
  const failures = [...limits, ...compiled.failures, ...collisions].sort(byFailureOrder);
  const inputs: ReportInput[] = sorted.map(file => ({ path: file.path, sha256: sha256Hex(file.bytes), treatment: compiled.treatments.get(file.path) ?? 'not-included' }));
  const outputs: ReportOutput[] = compiled.outputs.map(output => ({ path: output.path, sha256: sha256Hex(output.bytes) }));
  const report = buildLossReport({
    compiler: { name: COMPILER_NAME, version: COMPILER_VERSION },
    base: { version: base.version, label: base.label },
    lossPolicySha256: options.lossPolicySha256,
    inputs,
    outputs,
    losses: compiled.losses,
  });
  const revisions = [...new Set(classified.flatMap(entry => (entry.kind === 'tessera-ontology' ? [entry.revision] : [])))].sort((first, second) => first - second);
  const findings = classified.filter(entry => entry.kind !== 'other').map(entry => ({ document: entry.file.path, issues: 'issues' in entry ? entry.issues : [] }));
  return { outputs: failures.length ? [] : compiled.outputs, report, failures, findings, tesseraRevisions: revisions };
}
