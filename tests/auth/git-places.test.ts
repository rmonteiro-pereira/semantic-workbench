// Authorization reads the repository in the place the command will run in: the person's copy
// once it exists, even for a project where they hold no right to edit.
import { expect, test } from 'bun:test';
import type { Role } from '../../server/auth/access-config';
import { createAccessControl } from '../../server/auth/authorize';
import type { CloneEvent } from '../../server/projects/clone';
import { LOCAL_READER } from '../../server/projects/reader';
import { bareRepository } from '../helpers/git-fixtures';
import { testWorkspace } from '../helpers/temp-data-dir';
import { accessFixture, person } from './access-fixture';
import { saveText, signedIn } from './working-copy-fixture';

// A role that may fetch, pull and push but not change anything.
const PUSHER: Role = {
  id: 'r_pusher',
  name: 'Pusher',
  description: 'Reads and pushes.',
  permissions: [{ actions: ['read', 'history', 'viewOwnState', 'fetch', 'pull', 'push'] }],
  createdBy: 'bootstrap',
  createdAt: '2026-10-21T09:00:00Z',
};

async function cloneMonorepo(fixture: Awaited<ReturnType<typeof testWorkspace>>, bare: string) {
  const started = fixture.ws.clone(bare, undefined, LOCAL_READER);
  for (let attempt = 0; attempt < 400; attempt++) {
    const done = fixture.ws.events.replay(0)!.some(event => {
      const data = event.data as CloneEvent;
      return event.event === 'clone' && data.op === started.op && data.phase === 'done';
    });
    if (done) break;
    await Bun.sleep(10);
  }
  const projects = fixture.ws.state.registry().projects;
  return {
    sales: projects.find(project => project.name === 'Sales')!,
    finance: projects.find(project => project.name === 'Finance')!,
    projects,
  };
}

test('a push is judged on the branch of the copy it runs in, not on the published checkout', async () => {
  const remote = bareRepository('monorepo');
  using fixture = await testWorkspace();
  try {
    const { sales, finance, projects } = await cloneMonorepo(fixture, remote.bare);
    const options = accessFixture();
    const open = { stewards: [], restricted: [] };
    options.config.projects.projects[sales.slug] = {
      domain: 'sales',
      protectedBranches: [],
      ...open,
    };
    // Finance keeps every personal branch from being pushed.
    options.config.projects.projects[finance.slug] = {
      domain: 'hr',
      protectedBranches: ['work/*'],
      ...open,
    };
    options.config.roles.push(PUSHER);
    options.config.grants.push({
      id: 'g-alice-pusher',
      roleId: PUSHER.id,
      member: { kind: 'email', email: 'alice@example.org' },
      scope: { kind: 'domains', domains: ['hr'] },
      addedBy: 'bootstrap',
      addedAt: '2026-10-21T09:00:00Z',
    });
    const access = createAccessControl({
      ...options,
      knownProjects: () => projects.map(project => project.slug),
    });
    const alice = signedIn(fixture.ws, access)(person('alice'));
    // Alice edits Sales, so her copy exists on work/alice; Finance is a project she cannot edit.
    const file = 'sales.ontology.yaml';
    const edited = await saveText(alice.call, sales.slug, file, text => text + '# note\n');
    expect(edited.status).toBe(200);

    const refused = await alice.call(`/api/projects/${finance.slug}/git/push`, 'POST', {});
    expect(refused.status).toBe(403);
  } finally {
    remote.dispose();
  }
});
