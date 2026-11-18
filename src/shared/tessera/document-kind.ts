// Sorts the files of a project folder into Tessera ontologies, standard Ossie documents and everything else, validating the first two.
import { isObject } from '../edit/source-text';
import { isMapping } from '../mappings/mapping-schema';
import type { Issue } from '../validation/diagnostics';
import { validateInput } from '../validation/input';
import { parseSourceDocument, syntaxOf, type CompileFailure } from './compile-document';
import { summarizeItems, type DocumentReading } from './meaning-check';
import { readMarker } from './marker';

/** A file of the unit: its path inside the project folder and its bytes. */
export type UnitFile = { path: string; bytes: Uint8Array };

/** What a file is to the compiler. */
export type ClassifiedFile =
  | { kind: 'tessera-ontology'; file: UnitFile; text: string; issues: Issue[]; revision: number; reading: DocumentReading }
  | { kind: 'ossie'; file: UnitFile; text: string; issues: Issue[]; reading: DocumentReading }
  | { kind: 'other'; file: UnitFile }
  | { kind: 'invalid'; file: UnitFile; failures: CompileFailure[]; issues: Issue[] };

const STRUCTURED_FILE = /\.(ya?ml|json)$/i;
const OSSIE_KINDS = new Set(['Ossie ontology', 'Ossie semantic', 'Ossie mappings']);

function isContract(data: Record<string, unknown>): boolean {
  return data.kind === 'DataContract' || data.apiVersion !== undefined || data.schema !== undefined;
}

function isOssieShape(data: Record<string, unknown>): boolean {
  return !isContract(data) && (data.ontology !== undefined || data.datasets !== undefined || data.semantic_model !== undefined || !!isMapping(data));
}

function invalidFile(file: UnitFile, message: string, issues: Issue[] = []): ClassifiedFile {
  return { kind: 'invalid', file, issues, failures: [{ code: 'invalid-source', document: file.path, message }] };
}

function baseName(path: string): string {
  return path.split('/').at(-1)!;
}

type Validation = ReturnType<typeof validateInput>;

/** A document the validator accepts is Tessera, standard Ossie or something else, by what the validator found. */
function classifyValid(file: UnitFile, text: string, result: Extract<Validation, { valid: true }>): ClassifiedFile {
  const model = result.model;
  if (!('document' in model) || !OSSIE_KINDS.has(model.kind)) return { kind: 'other', file };
  const reading = { path: file.path, source: text, data: model.document, summary: summarizeItems(model) };
  if (model.format.family === 'tessera') return { kind: 'tessera-ontology', file, text, issues: result.issues, revision: model.format.revision, reading };
  return { kind: 'ossie', file, text, issues: result.issues, reading };
}

/** A document the validator refuses is an invalid Ossie or Tessera document, or a file that is not one of them. */
function classifyInvalid(file: UnitFile, text: string, issues: Issue[]): ClassifiedFile {
  const parsed = parseSourceDocument({ path: file.path, source: text }, syntaxOf(file.path));
  if ('code' in parsed) return invalidFile(file, parsed.message);
  const data = parsed.data;
  const ours = isObject(data) && (readMarker(data).family !== 'standard' || isOssieShape(data));
  if (!ours) return { kind: 'other', file };
  const failures = issues.filter(issue => issue.severity === 'error').map(issue => ({ code: 'invalid-source' as const, document: file.path, message: `${issue.path}: ${issue.message}` }));
  return { kind: 'invalid', file, issues, failures };
}

/** Classifies one file. A structured file that cannot be read is refused, never skipped. */
export function classifyFile(file: UnitFile): ClassifiedFile {
  if (!STRUCTURED_FILE.test(file.path)) return { kind: 'other', file };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
  } catch {
    return invalidFile(file, 'The file is not valid UTF-8 text.');
  }
  const result = validateInput(text, baseName(file.path));
  return result.valid ? classifyValid(file, text, result) : classifyInvalid(file, text, result.issues);
}
