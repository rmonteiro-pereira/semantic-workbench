// The tessera command line: `compile` turns a published project folder into a bundle of standard Ossie, and `check` shows what a compile would do without writing anything.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileUnit, type CompileResult, type UnitFile } from '../src/shared/tessera/compile-unit';
import { sha256Hex } from '../src/shared/tessera/digest';
import { LossPolicyError, acceptLoss, parseLossPolicy, printReport, type LossPolicy } from '../src/shared/tessera/loss-report';
import { buildManifest, printManifest, type ManifestSource } from '../src/shared/tessera/manifest';
import { REGISTRY } from '../src/shared/tessera/registry';
import { checkTarget, writeBundle } from '../src/server/tessera/bundle-writer';
import { readFolder } from '../src/server/tessera/disk-source';
import { TesseraRefusal } from '../src/server/tessera/refusal';
import { readSnapshot } from '../src/server/tessera/snapshot-source';
import { USAGE, UsageError, parseTesseraArguments, type CheckArguments, type CompileArguments } from './tessera-arguments';
import { EXIT, exitStatusOf, renderJson, renderText, type RunOutcome } from './tessera-output';

const encoder = new TextEncoder();

type Policy = { policy: LossPolicy; sha256: string };

const MAX_LOSS_POLICY_BYTES = 65_536;

function readPolicyText(path: string): string {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!fstatSync(descriptor).isFile()) throw new UsageError('The loss policy must be a regular file.');
    const bytes = Buffer.alloc(MAX_LOSS_POLICY_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const received = readSync(descriptor, bytes, length, bytes.length - length, null);
      if (received === 0) break;
      length += received;
    }
    if (length > MAX_LOSS_POLICY_BYTES) throw new UsageError(`The loss policy exceeds ${MAX_LOSS_POLICY_BYTES} bytes.`);
    return bytes.toString('utf8', 0, length);
  } finally {
    closeSync(descriptor);
  }
}

/** Reads the loss policy file. An unreadable or malformed file is misuse, not a refusal of the project. */
function readPolicy(path: string): Policy {
  let text: string;
  try {
    text = readPolicyText(path);
  } catch (error) {
    throw new UsageError(`The loss policy ${path} cannot be read: ${(error as Error).message}`);
  }
  try {
    return { policy: parseLossPolicy(text, REGISTRY), sha256: sha256Hex(text) };
  } catch (error) {
    if (error instanceof LossPolicyError) throw new UsageError(`${path}: ${error.message}`);
    throw error;
  }
}

function refused(source: RunOutcome['source'], message: string, compile: CompileResult | null = null): RunOutcome {
  return { result: 'refused', source, compile, accepted: null, message, bundle: null };
}

function bundleFiles(result: CompileResult, source: ManifestSource, accepted: 'digest' | 'policy' | 'none'): UnitFile[] {
  const manifest = buildManifest(result, source, accepted);
  return [...result.outputs, { path: 'manifest.json', bytes: encoder.encode(printManifest(manifest)) }, { path: 'loss-report.json', bytes: encoder.encode(printReport(result.report, source)) }];
}

async function runCompile(args: CompileArguments): Promise<RunOutcome> {
  const policy = args.lossPolicy ? readPolicy(args.lossPolicy) : undefined;
  const target = { folder: args.out, repository: args.repository, dataRoot: args.dataRoot };
  let source: Awaited<ReturnType<typeof readSnapshot>>;
  try {
    checkTarget(target);
    source = await readSnapshot({ repository: args.repository, projectFolder: args.projectFolder, branch: args.branch, commit: args.commit, dataRoot: args.dataRoot });
  } catch (error) {
    if (error instanceof TesseraRefusal) return refused({ kind: 'snapshot' }, error.message);
    throw error;
  }
  const manifestSource: ManifestSource = { kind: source.kind, branch: source.branch, commit: source.commit, projectFolder: source.projectFolder };
  const result = compileUnit(source.files, { lossPolicySha256: policy?.sha256 ?? null });
  if (result.failures.length) return refused(manifestSource, 'The compile failed, and no acceptance can override that.', result);
  const acceptance = acceptLoss(result.report, { digest: args.acceptLoss, policy: policy?.policy });
  if ('refusal' in acceptance) return { result: 'needs-acceptance', source: manifestSource, compile: result, accepted: null, message: acceptance.refusal, bundle: null };
  const files = bundleFiles(result, manifestSource, acceptance.accepted);
  try {
    writeBundle({ ...target, dataRoot: source.dataRoot ?? target.dataRoot }, files);
  } catch (error) {
    if (error instanceof TesseraRefusal) return refused(manifestSource, error.message, result);
    throw error;
  }
  return { result: 'compiled', source: manifestSource, compile: result, accepted: acceptance.accepted, bundle: { folder: resolve(args.out), files: files.map(file => file.path) } };
}

async function runCheck(args: CheckArguments): Promise<RunOutcome> {
  let files: UnitFile[];
  let source: RunOutcome['source'];
  try {
    if (args.files !== undefined) {
      files = readFolder(args.files).files;
      source = { kind: 'files-on-disk', unpublished: true };
    } else {
      const snapshot = await readSnapshot({ repository: args.repository!, projectFolder: args.projectFolder, branch: args.branch, commit: args.commit });
      files = snapshot.files;
      source = { kind: 'snapshot', branch: snapshot.branch, commit: snapshot.commit, projectFolder: snapshot.projectFolder };
    }
  } catch (error) {
    if (error instanceof TesseraRefusal) return refused({ kind: 'snapshot' }, error.message);
    throw error;
  }
  const result = compileUnit(files, { lossPolicySha256: null });
  if (result.failures.length) return refused(source, 'The compile would fail.', result);
  return { result: 'checked', source, compile: result, accepted: null, bundle: null };
}

/** Runs the command and returns its exit status, writing the answer to the given streams. */
export async function main(argv: string[], out: (text: string) => void = text => process.stdout.write(text), err: (text: string) => void = text => process.stderr.write(text)): Promise<number> {
  try {
    const args = parseTesseraArguments(argv);
    const outcome = args.command === 'compile' ? await runCompile(args) : await runCheck(args);
    out(args.json ? renderJson(outcome) : renderText(outcome));
    return exitStatusOf(outcome.result);
  } catch (error) {
    if (error instanceof UsageError) {
      err(`${error.message}\n\n${USAGE}`);
      return EXIT.misuse;
    }
    throw error;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
