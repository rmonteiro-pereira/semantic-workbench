// Git's own output stays in the server log; local mode keeps showing it.
import { expect, spyOn, test } from 'bun:test';
import { GitError } from '../../server/projects/git';
import { errorResponse } from '../../server/routes/http';

const failure = () =>
  new GitError('git push failed', {
    code: 1,
    stdout: '',
    stderr: 'fatal: unable to access /srv/data/projects/sales/.git: denied\n',
    bytes: new Uint8Array(),
  });

test('a server answers Git failed and logs the output with the request id', async () => {
  const log = spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = errorResponse(failure(), 'https://workbench.example', {
      serverMode: true,
      requestId: 'req-7',
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Git failed.' });
    expect(log.mock.calls.flat().join('\n')).toContain(
      '[http] req-7 GitError: git push failed | fatal: unable to access /srv/data/projects/sales/.git: denied',
    );
  } finally {
    log.mockRestore();
  }
});

test("local mode keeps Git's message", async () => {
  const response = errorResponse(failure());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'git push failed' });
});
