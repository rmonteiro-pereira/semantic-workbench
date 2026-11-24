// Proposal changes reach open browsers through the live events, but only people who read at least
// one declared project hear of them.
import { expect, test } from 'bun:test';
import { createAccessControl } from '../src/server/auth/authorize';
import { readableEvent } from '../src/server/projects/event-access';
import { person, accessFixture } from './auth/access-fixture';
import { proposalFixture } from './helpers/proposal-fixture';
import type { TestUserName } from './helpers/auth-identities';

test('a proposal event reaches a reader of a declared project and no one else', async () => {
  using fixture = await proposalFixture();
  const { sales, billing, people } = fixture.projects;
  const options = accessFixture();
  for (const slug of [sales.slug, billing.slug]) options.config.projects.projects[slug] = { domain: 'sales', stewards: [], restricted: [], protectedBranches: ['main'] };
  options.config.projects.projects[people.slug] = { domain: 'hr', stewards: [], restricted: [], protectedBranches: ['main'] };
  const access = createAccessControl({ ...options, knownProjects: () => [sales.slug, billing.slug, people.slug] });
  const hears = (who: TestUserName) => {
    const principal = access.principalFor(person(who));
    const scope = access.forRequest(principal);
    return fixture.ws.events
      .replay(0)!
      .filter(event => event.event === 'proposal')
      .filter(event => readableEvent(event, { scope, owner: principal.id }) !== null)
      .map(event => (event.data as { id: string }).id);
  };
  await fixture.dave().call(`/api/projects/${sales.slug}/proposals`, 'POST', { name: 'Sales only', projects: [sales.slug] });
  await fixture.dave().call(`/api/projects/${people.slug}/proposals`, 'POST', { name: 'People only', projects: [people.slug] });
  await fixture.dave().call(`/api/projects/${sales.slug}/proposals`, 'POST', { name: 'Both', projects: [sales.slug, people.slug] });
  expect(hears('alice')).toEqual(['sales-only', 'both']);
  expect(hears('carol')).toEqual(['people-only', 'both']);
  expect(hears('dave')).toEqual(['sales-only', 'people-only', 'both']);
  const event = fixture.ws.events.replay(0)!.find(candidate => candidate.event === 'proposal')!;
  expect(event.data).toEqual({ repository: fixture.repository, id: 'sales-only', kind: 'created' });
});
