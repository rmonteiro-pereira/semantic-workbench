// The documentation says what ships: the tool names and counts equal the registry, the model statement is present word for word, later increments are named as not available, and nothing claims results are marked untrusted.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../../src/server/mcp/tool-registry';
import { contractRows } from './helpers/tool-contract-table';

const MODEL_STATEMENT =
  'Semantic Workbench does not call a language model. When you connect an external agent, that agent can receive definitions you authorize and may send them to its model provider; its configuration and policies govern that onward use.';
const read = (path: string) => readFileSync(path, 'utf8');

test('docs/mcp.md lists exactly the registry tools, once each in its table', () => {
  const guide = read('docs/mcp.md');
  const listed = [...guide.matchAll(/^\| `([a-z_]+)` \|/gm)].map(match => match[1]);
  expect(listed.sort()).toEqual(TOOLS.map(tool => tool.name));
  expect(guide).toContain(`There are ${TOOLS.length} tools.`);
  expect(
    contractRows()
      .map(row => row.name)
      .sort(),
  ).toEqual(TOOLS.map(tool => tool.name));
});

test('README, ARCHITECTURE and the changelog state the tool count that ships', () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'docs/agent-runtime.md']) expect(read(file), file).toContain(`${TOOLS.length} tools`);
  expect(read('ARCHITECTURE.md')).toContain('the 21 tools');
});

test('the model statement appears word for word where the specification requires it', () => {
  for (const file of ['README.md', 'docs/mcp.md']) expect(read(file).replace(/\s+/g, ' '), file).toContain(MODEL_STATEMENT);
});

test('later increments are named as not yet available and no document claims untrusted markers', () => {
  const guide = read('docs/mcp.md');
  expect(guide).toContain('## Later increments');
  expect(guide).toContain('Not available yet');
  for (const increment of ['person sign-in', 'application grants', 'resources and prompts', 'administration']) expect(guide.toLowerCase()).toContain(increment);
  for (const file of ['README.md', 'docs/mcp.md', 'ARCHITECTURE.md', 'CHANGELOG.md'])
    expect(read(file), file).not.toMatch(/marked (as )?untrusted|untrusted[- ]content marker (is|are) (applied|set)/i);
  expect(guide).toContain('no marker for untrusted content');
});

test('every limit the guide states equals the code', async () => {
  const { GLOBAL_REQUEST_CAP_BYTES, DEFAULT_TOOL_REQUEST_CAP_BYTES } = await import('../../src/server/mcp/body-limits');
  const { RESULT_CAP_BYTES } = await import('../../src/server/mcp/tool-results');
  const { DEFAULT_CALL_LIMITS } = await import('../../src/server/mcp/call-limits');
  const guide = read('docs/mcp.md');
  expect(guide).toContain(GLOBAL_REQUEST_CAP_BYTES.toLocaleString('en-US'));
  expect(guide).toContain(DEFAULT_TOOL_REQUEST_CAP_BYTES.toLocaleString('en-US'));
  expect(guide).toContain(RESULT_CAP_BYTES.toLocaleString('en-US'));
  expect(guide).toContain(
    `${DEFAULT_CALL_LIMITS.callsPerSecond} per second with a burst of ${DEFAULT_CALL_LIMITS.burst}, ${DEFAULT_CALL_LIMITS.concurrent} at once, ${DEFAULT_CALL_LIMITS.deadlineMs / 1000} seconds each`,
  );
});
