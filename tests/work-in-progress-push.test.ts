// Push and sync send the default branch and ordinary feature branches to a remote as always, and
// refuse every branch the workbench keeps for work in progress, in either letter case.
import { expect, test } from 'bun:test';
import { call, ontology, scmProject, sh } from './helpers/scm';
import { WORK_IN_PROGRESS_MESSAGE, isWorkInProgressBranch } from '../src/server/projects/work-in-progress-push';

type Project = Awaited<ReturnType<typeof scmProject>>;

function remoteHasBranch(project: Project, branch: string) {
  return sh(project.bare, ['branch', '--list', branch]).trim() !== '';
}

// Puts the project's folder on a branch of the given name, with one commit of its own.
function checkOutBranchWithCommit(project: Project, branch: string) {
  const exists = sh(project.dir, ['branch', '--list', branch]).trim() !== '';
  sh(project.dir, exists ? ['switch', '-q', branch] : ['switch', '-q', '-c', branch]);
  sh(project.dir, ['commit', '-q', '--allow-empty', '-m', `Work on ${branch}`]);
}

const action = (name: 'push' | 'sync') => `/git/${name}`;

for (const name of ['push', 'sync'] as const) {
  test(`${name} sends the default branch and an ordinary feature branch`, async () => {
    const project = await scmProject();
    try {
      const published = sh(project.dir, ['rev-parse', 'refs/heads/main']).trim();
      for (const branch of ['main', 'feature-notes']) {
        sh(project.dir, branch === 'main' ? ['switch', '-q', branch] : ['switch', '-qc', branch]);
        const result = await call(project.t, 'POST', project.base + action(name));
        expect(result.status, branch).toBe(200);
        expect(result.body.ok, branch).toBe(true);
        expect(sh(project.bare, ['rev-parse', `refs/heads/${branch}`]).trim(), branch).toBe(published);
      }
    } finally {
      project.dispose();
    }
  });

  test(`${name} refuses a work-in-progress branch and sends nothing`, async () => {
    const project = await scmProject();
    try {
      for (const branch of ['work/alice', 'work/local', 'Work/Mixed', 'work/alice.a-proposal', 'proposal/rename', 'refs/workbench/hidden']) {
        checkOutBranchWithCommit(project, branch);
        const result = await call(project.t, 'POST', project.base + action(name));
        expect(result.status, branch).toBe(400);
        expect(result.body.error, branch).toBe(WORK_IN_PROGRESS_MESSAGE);
        expect(remoteHasBranch(project, branch), branch).toBe(false);
      }
    } finally {
      project.dispose();
    }
  });
}

test('commit with push keeps the commit and says the push was refused on a work branch', async () => {
  const project = await scmProject();
  try {
    checkOutBranchWithCommit(project, 'work/local');
    project.write('shop.yaml', ontology('Edited.'));
    await call(project.t, 'POST', project.base + '/git/stage', { all: true });
    const committed = await call(project.t, 'POST', project.base + '/git/commit', { message: 'Edit', push: true });
    expect(committed.status).toBe(200);
    expect(committed.body.pushed).toEqual({ ok: false, message: WORK_IN_PROGRESS_MESSAGE });
    expect(remoteHasBranch(project, 'work/local')).toBe(false);
  } finally {
    project.dispose();
  }
});

test('the rule names exactly the work, work-in-progress and proposal prefixes', () => {
  for (const branch of ['work/a', 'WORK/a', 'Work/B.c', 'proposal/x', 'PROPOSAL/x']) expect(isWorkInProgressBranch(branch), branch).toBe(true);
  for (const branch of ['main', 'feature/work', 'network/x', 'workbench', 'proposals', 'release/1']) expect(isWorkInProgressBranch(branch), branch).toBe(false);
});
