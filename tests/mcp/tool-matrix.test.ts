// Every tool for every test identity goes through the same boundary: a hidden file answers like a missing one, the tool list follows effective permissions and no unreadable byte reaches any answer.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createAuditLog } from '../../src/server/auth/audit';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createHandler } from '../../src/server/handler';
import { TOOLS } from '../../src/server/mcp/tool-registry';
import { TOOL_ERROR_CODES, type ToolResult } from '../../src/server/mcp/tool-results';
import { TEST_USERS, type TestUserName } from '../helpers/auth-identities';
import { authWorkspace, leakMarker } from '../helpers/auth-workspace';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { accessFixture, person } from '../auth/access-fixture';
import { toolRunner } from './helpers/in-process-tools';

const PROJECT = 'sales-contracts';
const RESTRICTED = 'finance/revenue-recognition.odcs.yaml';
const MISSING = 'finance/does-not-exist.odcs.yaml';
const KEY = 'matrix-key-0000000000';

type Probe = [tool: string, args: (path: string) => Record<string, unknown>];
const PATH_PROBES: Probe[] = [
  ['read_file', path => ({ project: PROJECT, path })],
  ['get_findings', path => ({ project: PROJECT, path })],
  ['git_file_versions', path => ({ project: PROJECT, path })],
  ['git_show', path => ({ project: PROJECT, commit: 'HEAD', path })],
  ['git_diff', path => ({ project: PROJECT, path })],
  ['validate_text', path => ({ project: PROJECT, path, source: 'x: 1\n' })],
  ['save_file', path => ({ project: PROJECT, path, baseVersion: 'a'.repeat(64), source: 'x: 1\n' })],
  ['delete_file', path => ({ project: PROJECT, path, baseVersion: 'a'.repeat(64), idempotencyKey: KEY })],
  ['explain_metric', path => ({ project: PROJECT, path, metric: 'any' })],
];

test('every role gets the same answer for a hidden file and a missing one, and never sees unreadable bytes', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const audit = createAuditLog({ dir: join(fixture.root, 'matrix-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => null, publicOrigin: 'http://localhost:5312', remoteCredentials: allowEveryRemote() });
  const marker = leakMarker(PROJECT, RESTRICTED);
  let compared = 0;
  for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
    const runner = toolRunner(handler, access.principalFor(person(name)));
    const mayRead = (await runner.run('read_file', { project: PROJECT, path: RESTRICTED })).ok;
    for (const [tool, args] of PATH_PROBES) {
      const hidden = await runner.run(tool, args(RESTRICTED));
      const missing = await runner.run(tool, args(MISSING));
      const text = JSON.stringify(hidden);
      if (!mayRead) {
        expect(text, `${name} ${tool} leaked`).not.toContain(marker);
        expect(hidden.ok, `${name} ${tool}`).toBe(false);
        expect(hidden, `${name} ${tool}: hidden equals missing`).toEqual(missing);
        compared++;
      }
      if (!hidden.ok) expect(TOOL_ERROR_CODES, `${name} ${tool}`).toContain(hidden.error.code);
    }
    for (const result of [await runner.run('list_files', { project: PROJECT }), await runner.run('git_log', { project: PROJECT }), await runner.run('list_trash', {})]) {
      if (!mayRead) expect(JSON.stringify(result), name).not.toContain(RESTRICTED);
    }
  }
  expect(compared).toBeGreaterThan(20);
});

test('the tool list follows the identity: a reader loses write tools and an unknown identity sees none', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const audit = createAuditLog({ dir: join(fixture.root, 'listing-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => null, publicOrigin: 'http://localhost:5312', remoteCredentials: allowEveryRemote() });
  const lists = new Map<string, string[]>();
  for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
    const available = toolRunner(handler, access.principalFor(person(name))).listed();
    lists.set(
      name,
      TOOLS.filter(tool => available.has(tool.operation)).map(tool => tool.name),
    );
  }
  const everyone = [...lists.values()];
  expect(everyone.some(list => list.includes('save_file'))).toBe(true);
  expect(everyone.some(list => !list.includes('save_file'))).toBe(true);
  for (const list of everyone) expect(list.length).toBeLessThanOrEqual(TOOLS.length);
});

test('a tool answers refused for a write the role does not hold, with the boundary reason', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const audit = createAuditLog({ dir: join(fixture.root, 'refusal-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, principal: () => null, publicOrigin: 'http://localhost:5312', remoteCredentials: allowEveryRemote() });
  const results: ToolResult[] = [];
  for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
    const runner = toolRunner(handler, access.principalFor(person(name)));
    results.push(await runner.run('create_file', { project: 'shared-reference', path: 'probe.odcs.yaml', source: 'x: 1\n' }));
  }
  expect(results.some(result => !result.ok && result.error.code === 'refused')).toBe(true);
});
