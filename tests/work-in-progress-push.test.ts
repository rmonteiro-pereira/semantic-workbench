// Pins which branches push and sync send to a remote today: the default branch, an ordinary feature
// branch, and the work-in-progress branches the workbench keeps for people. The cases for
// `work/` branches are the ones the work-in-progress push rule changes.
import { expect, test } from 'bun:test';
import { call, scmProject, sh } from './helpers/scm';

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
      for (const branch of ['main', 'feature-notes']) {
        checkOutBranchWithCommit(project, branch);
        const result = await call(project.t, 'POST', project.base + action(name));
        expect(result.status, branch).toBe(200);
        expect(result.body.ok, branch).toBe(true);
        expect(remoteHasBranch(project, branch), branch).toBe(true);
      }
    } finally {
      project.dispose();
    }
  });

  test(`${name} sends a work-in-progress branch`, async () => {
    const project = await scmProject();
    try {
      for (const branch of ['work/alice', 'work/local']) {
        checkOutBranchWithCommit(project, branch);
        const result = await call(project.t, 'POST', project.base + action(name));
        expect(result.status, branch).toBe(200);
        expect(result.body.ok, branch).toBe(true);
        expect(remoteHasBranch(project, branch), branch).toBe(true);
      }
    } finally {
      project.dispose();
    }
  });
}
