import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const guide = readFileSync(new URL('../docs/agent-connections.md', import.meta.url), 'utf8');
const acceptance = readFileSync(new URL('../docs/mcp-acceptance.md', import.meta.url), 'utf8');

test('each documented program has an explicit acceptance status', () => {
  for (const name of ['Protocol reference client', 'Codex CLI']) {
    const section = guide.split(`## ${name}\n`)[1]?.split('\n## ')[0];
    expect(section).toBeDefined();
    expect(section).toMatch(/Status: (not tested|supported)/);
    if (section?.includes('Status: supported')) {
      expect(acceptance).toContain(`## ${name}`);
      expect(acceptance).toMatch(/server mode.*pass/i);
    }
  }
});

test('registrations require secure exact redirects and describe onward use', () => {
  expect(guide).toContain('custom schemes are refused');
  expect(guide).toContain('PKCE S256');
  expect(guide).toContain('may send them to its model provider');
});
