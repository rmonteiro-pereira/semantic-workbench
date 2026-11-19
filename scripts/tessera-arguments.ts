// Reads and checks the options of the tessera command so every misuse is named before anything is read or written.
import { parseArgs } from 'node:util';

/** Says the command was used wrongly. The command line turns it into exit status 64. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** The options both commands read from a repository. */
type RepositoryChoice = { projectFolder?: string; branch?: string; commit?: string };

/** The compile command. */
export type CompileArguments = RepositoryChoice & { command: 'compile'; repository: string; out: string; dataRoot?: string; acceptLoss?: string; lossPolicy?: string; json: boolean };

/** The check command: a committed snapshot, or a folder on disk. */
export type CheckArguments = RepositoryChoice & { command: 'check'; repository?: string; files?: string; json: boolean };

/** What the command line asked for. */
export type TesseraArguments = CompileArguments | CheckArguments;

/** The usage text, shown on misuse. */
export const USAGE = `Usage:
  bun run tessera compile --repository <dir> --out <dir> [--project-folder <path>] [--branch <name>] [--commit <full id>]
                          [--data-root <dir>] [--accept-loss <digest>] [--loss-policy <file>] [--json]
  bun run tessera check --repository <dir> [--project-folder <path>] [--branch <name>] [--commit <full id>] [--json]
  bun run tessera check --files <dir> [--json]
`;

const OPTIONS = {
  repository: { type: 'string' },
  out: { type: 'string' },
  'project-folder': { type: 'string' },
  branch: { type: 'string' },
  commit: { type: 'string' },
  'data-root': { type: 'string' },
  'accept-loss': { type: 'string' },
  'loss-policy': { type: 'string' },
  files: { type: 'string' },
  json: { type: 'boolean' },
} as const;

const COMPILE_ONLY = ['out', 'data-root', 'accept-loss', 'loss-policy'] as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function parseOptions(args: string[]) {
  try {
    return parseArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
}

function choiceFrom(values: Record<string, string | boolean | undefined>): RepositoryChoice {
  return { projectFolder: values['project-folder'] as string | undefined, branch: values.branch as string | undefined, commit: values.commit as string | undefined };
}

function compileArguments(values: Record<string, string | boolean | undefined>): CompileArguments {
  if (values.files !== undefined) throw new UsageError('--files belongs to the check command.');
  if (typeof values.repository !== 'string') throw new UsageError('compile needs --repository.');
  if (typeof values.out !== 'string') throw new UsageError('compile needs --out.');
  const digest = values['accept-loss'] as string | undefined;
  if (digest !== undefined && !DIGEST.test(digest)) throw new UsageError('--accept-loss needs a digest written as sha256: followed by 64 hexadecimal characters.');
  return {
    command: 'compile',
    repository: values.repository,
    out: values.out,
    dataRoot: values['data-root'] as string | undefined,
    acceptLoss: digest,
    lossPolicy: values['loss-policy'] as string | undefined,
    json: values.json === true,
    ...choiceFrom(values),
  };
}

function checkArguments(values: Record<string, string | boolean | undefined>): CheckArguments {
  const misplaced = COMPILE_ONLY.find(name => values[name] !== undefined);
  if (misplaced) throw new UsageError(`--${misplaced} belongs to the compile command.`);
  const repository = values.repository as string | undefined;
  const files = values.files as string | undefined;
  if ((repository === undefined) === (files === undefined)) throw new UsageError('check needs exactly one of --repository and --files.');
  if (files !== undefined && (values.branch !== undefined || values.commit !== undefined || values['project-folder'] !== undefined))
    throw new UsageError('--files reads one folder as it is, so it takes no --branch, --commit or --project-folder.');
  return { command: 'check', repository, files, json: values.json === true, ...choiceFrom(values) };
}

/** Parses the command line, or throws a UsageError that names the mistake. */
export function parseTesseraArguments(args: string[]): TesseraArguments {
  const { values, positionals } = parseOptions(args);
  const [command, ...extra] = positionals;
  if (extra.length) throw new UsageError(`Unexpected argument: ${extra[0]}.`);
  if (command === 'compile') return compileArguments(values);
  if (command === 'check') return checkArguments(values);
  throw new UsageError(command ? `Unknown command: ${command}.` : 'Give a command: compile or check.');
}
