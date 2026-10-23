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
    const written = log.mock.calls.flat().join('\n');
    expect(written).toContain('http.git-failed requestId=req-7');
    expect(written).toContain('git push failed');
    expect(written).toContain('fatal: unable to access <path>: denied');
    expect(written).not.toContain('/srv/data');
  } finally {
    log.mockRestore();
  }
});

test("local mode keeps Git's message", async () => {
  const response = errorResponse(failure());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: 'git push failed' });
});
