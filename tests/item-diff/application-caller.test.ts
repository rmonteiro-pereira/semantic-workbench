import { expect, test } from 'bun:test';
import { mintCaller } from '../../src/server/auth/caller';
import { localPrincipal } from '../../src/server/auth/principal';
import { itemDiffAgentAnswers, itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';

test('application callers cannot compare sides or observe unpublished definitions', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const origin = 'http://localhost:5173/api/projects/finance';
  const url = origin + '/item-diff?from=published&to=working';
  const unknown = await fixture.handler(new Request(origin + '/unknown'));
  const http = await fixture.handler(new Request(url));
  expect(http.status).toBe(unknown.status);
  expect(await http.text()).toBe(await unknown.text());
  const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp' });
  const twin = await fixture.handler.boundary.operate({ caller, request: new Request(url) });
  expect(twin.response.status).toBe(404);
  const baseline = await Bun.file('tests/fixtures/item-diff/baseline.json').json();
  expect(await itemDiffAgentAnswers(fixture)).toEqual(baseline.agent);
});
