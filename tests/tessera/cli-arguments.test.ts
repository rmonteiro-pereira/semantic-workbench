// Checks every option of the tessera command is read, and every misuse is named before anything is done.
import { expect, test } from 'bun:test';
import { UsageError, parseTesseraArguments } from '../../scripts/tessera-arguments';

const digest = 'sha256:' + 'a'.repeat(64);

test('compile reads every option', () => {
  const args = parseTesseraArguments([
    'compile',
    '--repository',
    'repo',
    '--out',
    'out',
    '--project-folder',
    'retail',
    '--branch',
    'main',
    '--commit',
    'c'.repeat(40),
    '--data-root',
    'data',
    '--accept-loss',
    digest,
    '--loss-policy',
    'policy.json',
    '--json',
  ]);
  expect(args).toEqual({
    command: 'compile',
    repository: 'repo',
    out: 'out',
    projectFolder: 'retail',
    branch: 'main',
    commit: 'c'.repeat(40),
    dataRoot: 'data',
    acceptLoss: digest,
    lossPolicy: 'policy.json',
    json: true,
  });
});

test('compile needs only a repository and an output folder', () => {
  expect(parseTesseraArguments(['compile', '--repository', 'repo', '--out', 'out'])).toMatchObject({ command: 'compile', json: false, projectFolder: undefined });
});

test('check reads a repository or a folder', () => {
  expect(parseTesseraArguments(['check', '--repository', 'repo', '--project-folder', 'retail', '--branch', 'main', '--commit', 'c'.repeat(40), '--json'])).toEqual({
    command: 'check',
    repository: 'repo',
    files: undefined,
    json: true,
    projectFolder: 'retail',
    branch: 'main',
    commit: 'c'.repeat(40),
  });
  expect(parseTesseraArguments(['check', '--files', 'folder'])).toMatchObject({ command: 'check', files: 'folder', repository: undefined });
});

const misuse: [string, string[]][] = [
  ['no command', []],
  ['an unknown command', ['convert']],
  ['an unknown option', ['compile', '--repository', 'r', '--out', 'o', '--force']],
  ['a missing repository', ['compile', '--out', 'o']],
  ['a missing output folder', ['compile', '--repository', 'r']],
  ['an option without its value', ['compile', '--repository']],
  ['a stray argument', ['compile', '--repository', 'r', '--out', 'o', 'extra']],
  ['a malformed digest', ['compile', '--repository', 'r', '--out', 'o', '--accept-loss', 'abc']],
  ['--files on compile', ['compile', '--repository', 'r', '--out', 'o', '--files', 'f']],
  ['check with neither source', ['check']],
  ['check with both sources', ['check', '--repository', 'r', '--files', 'f']],
  ['--out on check', ['check', '--repository', 'r', '--out', 'o']],
  ['--accept-loss on check', ['check', '--repository', 'r', '--accept-loss', digest]],
  ['--loss-policy on check', ['check', '--repository', 'r', '--loss-policy', 'p']],
  ['--data-root on check', ['check', '--repository', 'r', '--data-root', 'd']],
  ['--branch with --files', ['check', '--files', 'f', '--branch', 'main']],
];

for (const [label, args] of misuse) {
  test(`${label} is misuse`, () => {
    expect(() => parseTesseraArguments(args)).toThrow(UsageError);
  });
}
