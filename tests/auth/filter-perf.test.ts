// Measures real Cedar-backed filtering with cold request caches on a synthetic workspace.
import { expect, test } from 'bun:test';
import { createAccessControl, type ResourceRef } from '../../src/server/auth/authorize';
import { localPrincipal } from '../../src/server/auth/principal';
import { accessFixture, person } from './access-fixture';

function measuredMedian(run: () => void): number {
  const times: number[] = [];
  for (let index = 0; index < 5; index++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.sort((left, right) => left - right)[2];
}

test('project and file filtering stay within the request latency budget', () => {
  const options = accessFixture();
  const projects = Array.from({ length: 20 }, (_, index) => `project-${index}`);
  const projectAccess = options.config.projects.projects['sales-contracts'];
  options.config.projects.projects = Object.fromEntries(
    projects.map(project => [project, structuredClone(projectAccess)]),
  );
  options.config.grants = [
    {
      id: 'viewer',
      roleId: 'viewer',
      member: { kind: 'email', email: 'alice@example.org' },
      scope: { kind: 'workspace' },
      addedBy: 'test',
      addedAt: '2026-10-21T00:00:00Z',
    },
  ];
  const settings = { ...options, knownProjects: () => projects };
  const server = createAccessControl(settings);
  const local = createAccessControl({ ...settings, mode: 'local' });
  const files: ResourceRef[] = projects.flatMap(project =>
    Array.from({ length: 250 }, (_, index) => ({
      type: 'file' as const,
      project,
      path: `${index % 10 ? 'public' : 'finance'}/${index}.yaml`,
    })),
  );
  const listing = projects.map(project => ({ type: 'project' as const, project }));
  const identity = person('alice');
  const serverRun = () => {
    expect(server.filter(server.principalFor(identity), 'read', files, item => item)).toHaveLength(
      4500,
    );
  };
  const localRun = () => {
    expect(local.filter(localPrincipal(), 'read', files, item => item)).toHaveLength(5000);
  };
  serverRun();
  localRun();
  const projectsMs = measuredMedian(() => {
    expect(
      server.filter(server.principalFor(identity), 'read', listing, item => item),
    ).toHaveLength(20);
  });
  const localMs = measuredMedian(localRun);
  const serverMs = measuredMedian(serverRun);
  console.info(
    `Access filtering median: projects ${projectsMs.toFixed(1)} ms, ` +
      `server files ${serverMs.toFixed(1)} ms, local files ${localMs.toFixed(1)} ms`,
  );
  expect(projectsMs).toBeLessThanOrEqual(150);
  expect(serverMs).toBeLessThanOrEqual(localMs * 1.1 + 50);
});
