// Sorts the files of a project folder into Tessera ontologies, standard Ossie documents and everything else, validating the first two.
import { isObject } from '../edit/source-text';
import { isMapping } from '../mappings/mapping-schema';
import type { Issue } from '../validation/diagnostics';
import { validateInput } from '../validation/input';
import { parseSourceDocument, type CompileFailure, type ParsedSource } from './compile-document';
import { summarizeItems, type DocumentReading } from './meaning-check';
import { readMarker } from './marker';

/** A file of the unit: its path inside the project folder and its bytes. */
export type UnitFile = { path: string; bytes: Uint8Array };

/** What a file is to the compiler. */
export type ClassifiedFile =
  | { kind: 'tessera-ontology'; file: UnitFile; text: string; issues: Issue[]; revision: number; parsed: ParsedSource; reading: DocumentReading }
  | { kind: 'ossie'; file: UnitFile; text: string; issues: Issue[]; parsed: ParsedSource; reading: DocumentReading }
  | { kind: 'other'; file: UnitFile }
  | { kind: 'invalid'; file: UnitFile; failures: CompileFailure[]; issues: Issue[] };

const STRUCTURED_FILE = /\.(ya?ml|json)$/i;

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

/** Validates a document that is Ossie or Tessera and says what it is, or why it is refused. */
function validated(file: UnitFile, text: string, parsed: ParsedSource, tesseraRevision: number | null): ClassifiedFile {
  const result = validateInput(text, baseName(file.path));
  if (!result.valid) {
    const failures = result.issues.filter(issue => issue.severity === 'error').map(issue => ({ code: 'invalid-source' as const, document: file.path, message: `${issue.path}: ${issue.message}` }));
    return { kind: 'invalid', file, issues: result.issues, failures };
  }
  const reading = { path: file.path, source: text, data: parsed.data, summary: summarizeItems(result.model) };
  if (tesseraRevision !== null) return { kind: 'tessera-ontology', file, text, issues: result.issues, revision: tesseraRevision, parsed, reading };
  return { kind: 'ossie', file, text, issues: result.issues, parsed, reading };
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
  const parsed = parseSourceDocument({ path: file.path, source: text }, file.path.toLowerCase().endsWith('.json') ? 'json' : 'yaml');
  if ('code' in parsed) return invalidFile(file, parsed.message);
  if (!isObject(parsed.data)) return { kind: 'other', file };
  const reading = readMarker(parsed.data);
  if (reading.family === 'tessera') return validated(file, text, parsed, reading.revision);
  if (reading.family === 'invalid') return validated(file, text, parsed, null);
  return isOssieShape(parsed.data) ? validated(file, text, parsed, null) : { kind: 'other', file };
}
