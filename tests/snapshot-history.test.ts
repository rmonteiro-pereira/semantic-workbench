// Reads history through each editor's own request scope in a repository shared by their copies.
import { expect, test } from 'bun:test';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler } from '../src/server/handler';
import { createAccessControl } from '../src/server/auth/authorize';
import { accessFixture, person } from './auth/access-fixture';
import { authWorkspace } from './helpers/auth-workspace';
import { allowEveryRemote } from './helpers/remote-credentials-fixture';

test('history permits published and own commits while another editor personal commit is missing', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  let principal = access.principalFor(person('bob'));
  const handler = createHandler(fixture.ws, { mode: 'server', access, principal: () => principal, remoteCredentials: allowEveryRemote(), publicOrigin: 'http://localhost' });
  const project = 'sales-contracts';
  const path = 'sales.mapping.yaml';
  const root = `http://localhost/api/projects/${project}/git/`;
  const read = async (operation: string, commit: string) => {
    const response = await handler(new Request(`${root}${operation}?path=${path}&commit=${commit}`, { headers: { Cookie: 'session=fixture' } }));
    expect(response.status).toBe(200);
    return response.json();
  };
  async function personalCommit(name: 'alice' | 'bob') {
    principal = access.principalFor(person(name));
    const response = await handler(new Request(root + 'stage', { method: 'POST', headers: { Origin: 'http://localhost', 'X-SW-Request': '1' }, body: '{"all":true}' }));
    expect(response.status).toBe(200);
    const directory = join(fixture.ws.layout.worktrees, principal.key, project);
    appendFileSync(join(directory, path), `\n# private ${name}\n`);
    await fixture.ws.git.run(directory, ['commit', '-qam', `Personal ${name}`]);
    return (await fixture.ws.git.head(directory))!;
  }
  const foreign = await personalCommit('bob');
  expect((await read('show', foreign)).source).toContain('private bob');
  const own = await personalCommit('alice');
  expect(await read('show', foreign)).toEqual(await read('show', '0'.repeat(40)));
  expect((await read('show', foreign)).exists).toBe(false);
  expect((await read('show', own)).source).toContain('private alice');
  expect((await read('show', 'HEAD')).source).toContain('private alice');
  const published = fixture.ws.published.pin().commits.get(project)!.commit;
  expect((await read('show', published)).exists).toBe(true);
  expect((await read('show', own.slice(0, 12))).exists).toBe(false);
  const versions = await read('versions', foreign);
  expect(versions.some((version: { commit: string }) => version.commit === own)).toBe(true);
  expect(JSON.stringify(versions)).not.toContain('private bob');
});
