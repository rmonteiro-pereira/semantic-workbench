// Describes and measures Git commands for traces and metrics. The description keeps the
// subcommand and option names only: positional arguments can be paths or remote addresses, and
// option values (`-c user.email=...`, `--author=...`) can hold personal data or credentials.
import { recordGitCommand } from './metrics';
import { withSpan } from './tracing';

const MAX_OPTIONS = 12;
const OPTION_NAME = /^--?[A-Za-z][\w-]*/;

/** What a trace may say about the arguments of a Git invocation. */
export type GitSummary = { options: string[]; argumentCount: number };

/** Reduces an argument list to its option names and its length. */
export function summarizeGitArgs(args: string[]): GitSummary {
  const options: string[] = [];
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    // The value after -c or -C is a setting or a directory, neither of which is reported.
    if (arg === '-c' || arg === '-C') {
      skipNext = true;
      continue;
    }
    const name = OPTION_NAME.exec(arg)?.[0];
    if (name && !options.includes(name) && options.length < MAX_OPTIONS) options.push(name);
  }
  return { options, argumentCount: args.length };
}

/** The result a Git run reports back to the observer. */
export type GitOutcome = { code: number };

/** Runs a Git command inside a span and records its duration and whether it failed. */
export async function observeGitCommand<T extends GitOutcome>(
  subcommand: string,
  args: string[],
  remote: boolean,
  run: () => Promise<T>,
): Promise<T> {
  const summary = summarizeGitArgs(args);
  const attributes = {
    'sw.git.subcommand': subcommand,
    'sw.git.options': summary.options.join(' '),
    'sw.git.argument_count': summary.argumentCount,
    'sw.git.remote': remote,
  };
  const started = performance.now();
  let failed = true;
  try {
    return await withSpan(`git ${subcommand}`, { attributes }, async span => {
      const result = await run();
      span.setAttribute('sw.git.exit_code', result.code);
      failed = result.code !== 0;
      return result;
    });
  } finally {
    recordGitCommand(subcommand, performance.now() - started, failed);
  }
}
