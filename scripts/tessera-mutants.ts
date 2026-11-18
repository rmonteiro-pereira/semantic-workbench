// Deliberate faults in the Tessera format, compiler and command line. Each must make a focused case in scripts/tessera-mutation-cases.ts fail.

/** One fault: its category, the file, the exact text to replace and the faulty text. */
type Mutant = [category: string, file: string, before: string, after: string];

const validation = 'src/shared/validation/validation.ts';
const marker = 'src/shared/tessera/marker.ts';
const validate = 'src/shared/tessera/validate.ts';
const compileDocument = 'src/shared/tessera/compile-document.ts';
const lossReport = 'src/shared/tessera/loss-report.ts';
const compileUnit = 'src/shared/tessera/compile-unit.ts';
const agentView = 'src/shared/tessera/agent-view.ts';
const snapshotSource = 'src/server/tessera/snapshot-source.ts';
const bundleWriter = 'src/server/tessera/bundle-writer.ts';
const command = 'scripts/tessera.ts';

/** The faults of the Tessera format and compiler. */
export const tesseraMutants: Mutant[] = [
  ['tessera', validation, "const marked = !options.nested && readMarker(data).family !== 'standard';", 'const marked = false;'],
  ['tessera', marker, '!Object.hasOwn(data, TesseraNames.markerKey)', '!JSON.stringify(data).includes(\'"tessera"\')'],
  ['tessera', validate, 'if (declaredRevision !== undefined && !revisions.includes(declaredRevision))', 'if (false)'],
  ['tessera', validate, '} else if (!entry) {', '} else if (!entry) {\n      continue;'],
  ['tessera', validate, 'if (owner !== undefined) {', 'if (false) {'],
  ['tessera', validate, '} else if (!site.place || !entry.places.includes(site.place)) {', '} else if (false) {'],
  ['tessera', validate, 'if (declaredRevision !== undefined && isOntology && !base) {', 'if (false) {'],
  ['tessera', validate, 'if (validate(data)) return [];', 'return [];'],
  ['tessera', compileDocument, 'for (const site of sites) yaml.deleteIn(site.path);', ''],
  ['tessera', compileDocument, 'yaml.delete(TesseraNames.markerKey);', ''],
  ['tessera', compileDocument, 'losses.push(lossOf(document.path, data, site));', 'void site;'],
  ['tessera', lossReport, 'compiler: subject.compiler,', "compiler: { ...subject.compiler, version: '' },"],
  ['tessera', lossReport, 'offer.digest !== undefined && offer.digest === report.digest', 'offer.digest !== undefined'],
  ['tessera', lossReport, '.filter(property => !offer.policy!.allow.includes(property))', '.filter(() => false)'],
  ['tessera', command, "if (result.failures.length) return refused(manifestSource, 'The compile failed, and no acceptance can override that.', result);", ''],
  [
    'tessera',
    compileUnit,
    'function outputSchemaFailures(path: string, result: ReturnType<typeof validateInput>): CompileFailure[] {',
    'function outputSchemaFailures(path: string, result: ReturnType<typeof validateInput>): CompileFailure[] {\n  if (path) return [];',
  ],
  ['tessera', compileUnit, 'if (earlier !== undefined)', 'if (false)'],
  ['tessera', compileUnit, 'const sorted = [...files].sort((first, second) => compareText(first.path, second.path));', 'const sorted = [...files];'],
  ['tessera', snapshotSource, 'bytes: blobs.get(entry.id)! }', 'bytes: new Uint8Array(readFileSync(join(directory, entry.path))) }'],
  ['tessera', snapshotSource, 'if (!(await git.isAncestor(directory, requested, tip)))', 'if (false)'],
  ['tessera', bundleWriter, 'write: FileWriter = writeFileDurably) {\n  checkTarget(target);', 'write: FileWriter = writeFileDurably) {'],
  ['tessera', bundleWriter, 'renameSync(temporary, output);', 'void output;'],
  ['tessera', bundleWriter, 'rmSync(temporary, { recursive: true, force: true });', 'void temporary;'],
  ['tessera', agentView, "if (readMarker(data).family === 'standard') return data;", 'return data;'],
];
