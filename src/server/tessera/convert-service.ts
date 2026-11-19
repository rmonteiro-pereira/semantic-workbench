// The reviewed rewrite: turns one clean, committed Tessera ontology of the caller's working copy into standard Ossie through the ordinary save. Nothing is committed, pushed or published.
import { compileFindings, type CompileFinding } from '../../shared/tessera/compile-findings';
import { compileUnit, type CompileOptions, type CompileResult, type UnitFile } from '../../shared/tessera/compile-unit';
import { classifyFile } from '../../shared/tessera/document-kind';
import { NotFoundError } from '../projects/errors';
import { decideAcceptance } from './accept-loss';
import type { ConvertRequest } from './compile-request';
import type { UnitSource } from './unit-source';

/** The answer of a conversion: the file, its new version and the digest that was accepted. */
export type ConvertAnswer = { path: string; version: string; lossDigest: string };

/** Why a conversion was not done. The code is the contract's own word for the reason. */
export type ConvertRefusalCode = 'version-changed' | 'dirty' | 'no-history' | 'not-tessera' | 'digest-mismatch' | 'refused';

/** A conversion that was not done, with the findings when the compile itself refused. */
export class ConvertRefusal extends Error {
  constructor(
    readonly code: ConvertRefusalCode,
    message: string,
    readonly findings: CompileFinding[] = [],
  ) {
    super(message);
    this.name = 'ConvertRefusal';
  }
}

/** Whether the file in the working copy equals what Git holds for the caller's branch. */
export type CommittedState = 'clean' | 'changed' | 'no-history';

/** What the conversion needs from the workspace, passed in so the decisions stay free of Git and disk. */
export type ConvertDeps = {
  units: UnitSource;
  /** The saved file in the caller's working copy, or null when it is not there. */
  currentFile(path: string): { hash: string; bytes: Uint8Array } | null;
  committedState(path: string): Promise<CommittedState>;
  /** The ordinary save: guards, validation, journal and audit all run inside it. */
  save(path: string, baseHash: string, source: string): Promise<{ hash: string }>;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function replacing(files: UnitFile[], path: string, text: string): UnitFile[] {
  return files.map(file => (file.path === path ? { path, bytes: encoder.encode(text) } : file));
}

function sameInputs(compile: CompileResult, requested: ConvertRequest['inputs']): boolean {
  const current = compile.report.inputs.map(input => `${input.path}\n${input.sha256}`).sort();
  const asked = requested.map(input => `${input.path}\n${input.sha256}`).sort();
  return current.length === asked.length && current.every((entry, index) => entry === asked[index]);
}

function refuseUnlessTessera(path: string, bytes: Uint8Array) {
  if (classifyFile({ path, bytes }).kind !== 'tessera-ontology') throw new ConvertRefusal('not-tessera', 'Only a Tessera ontology can be converted to standard Ossie.');
}

async function refuseUnlessCommitted(deps: ConvertDeps, path: string) {
  const state = await deps.committedState(path);
  if (state === 'no-history') throw new ConvertRefusal('no-history', 'This project has no Git history, so there would be no backup of the file. Commit it first.');
  if (state === 'changed') throw new ConvertRefusal('dirty', 'This file has changes that are not committed. Commit or discard them first, so Git holds the backup.');
}

function refuseUnlessReviewed(compile: CompileResult, request: ConvertRequest) {
  if (compile.failures.length) throw new ConvertRefusal('refused', 'The project does not compile, so the file cannot be converted.', compileFindings(compile));
  if (!sameInputs(compile, request.inputs)) throw new ConvertRefusal('digest-mismatch', 'A file of the project changed after the review. Review the conversion again.');
  const decision = decideAcceptance(compile.report, compile.failures, { digest: request.digest });
  if (decision.decision !== 'accepted') throw new ConvertRefusal('digest-mismatch', 'The report changed after the review. Review the conversion again.');
}

function convertedText(compile: CompileResult, path: string): string {
  const output = compile.outputs.find(file => file.path === path);
  if (!output) throw new ConvertRefusal('refused', 'The compile produced no file for this path.');
  return decoder.decode(output.bytes);
}

/** Refuses a conversion that would leave the project unable to compile, naming the findings. */
function refuseUnlessStillCompiles(compile: UnitCompiler, files: UnitFile[], path: string, text: string, options: CompileOptions) {
  const after = compile(replacing(files, path, text), options);
  if (after.failures.length) throw new ConvertRefusal('refused', 'The project would not compile with this file converted.', compileFindings(after));
}

/** The compiler the conversion runs, passed in so a test can make the converted unit fail. */
export type UnitCompiler = typeof compileUnit;

/** Converts one file. The checks run in a fixed order, so the same mistake always gets the same answer. */
export async function convertToStandard(deps: ConvertDeps, request: ConvertRequest, compile: UnitCompiler = compileUnit): Promise<ConvertAnswer> {
  const current = deps.currentFile(request.path);
  if (!current) throw new NotFoundError('Not found.');
  refuseUnlessTessera(request.path, current.bytes);
  if (current.hash !== request.baseHash) throw new ConvertRefusal('version-changed', 'The file changed after the review. Review the conversion again.');
  await refuseUnlessCommitted(deps, request.path);
  const unit = await deps.units.read('working');
  const options = { lossPolicySha256: null, providers: unit.mesh?.providers, project: unit.project };
  const result = compile(unit.files, options);
  refuseUnlessReviewed(result, request);
  const text = convertedText(result, request.path);
  refuseUnlessStillCompiles(compile, unit.files, request.path, text, options);
  const saved = await deps.save(request.path, request.baseHash, text);
  return { path: request.path, version: saved.hash, lossDigest: result.report.digest };
}
