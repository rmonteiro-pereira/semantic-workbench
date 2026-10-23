// A remote named in a repository's own configuration reaches Git only when it is a plain name,
// so a repository registered from disk cannot turn a remote name into a Git option.
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { call, scmProject, sh } from './helpers/scm';

test('a remote whose name looks like an option is refused and nothing runs', async () => {
  const project = await scmProject({ remote: false });
  const scratch = mkdtempSync(join(tmpdir(), 'workbench-remote-name-'));
  try {
    const marker = join(scratch, 'ran');
    const script = join(scratch, 'upload-pack.sh');
    writeFileSync(script, `#!/bin/sh\ntouch ${marker}\n`);
    chmodSync(script, 0o755);
    sh(project.dir, ['config', `remote.--upload-pack=${script}.url`, project.dir]);

    for (const action of ['fetch', 'pull', 'push', 'sync']) {
      const refused = await call(project.t, 'POST', `${project.base}/git/${action}`);
      expect(refused.status, action).toBe(400);
      expect(refused.body.error, action).toContain('remote name');
    }
    expect(existsSync(marker)).toBe(false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    project.dispose();
  }
});

test('a plain remote name still reaches Git', async () => {
  const project = await scmProject();
  try {
    const fetched = await call(project.t, 'POST', `${project.base}/git/fetch`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.ok).toBe(true);
  } finally {
    project.dispose();
  }
});
