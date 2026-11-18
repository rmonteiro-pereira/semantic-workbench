// Keeps the compile guide's local references and Bun commands usable without reading planning documents.
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const guidePath = 'docs/compile.md';
const guide = readFileSync(guidePath, 'utf8');
const packageScripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

test('every local link in the compile guide resolves to an existing file', () => {
  const links = [...guide.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    if (/^https?:/.test(link)) continue;
    const path = link.split('#')[0];
    expect(existsSync(resolve(dirname(guidePath), path)), link).toBe(true);
  }
});

test('every Bun command in the compile guide names an existing script and supported command', () => {
  const commands = [...guide.matchAll(/^bun run (\S+) (\S+).*$/gm)];
  expect(commands.length).toBe(3);
  const commandArguments = readFileSync('scripts/tessera-arguments.ts', 'utf8');
  for (const [, script, command] of commands) {
    expect(typeof packageScripts[script], script).toBe('string');
    const scriptPath = packageScripts[script].split(' ').find((part: string) => part.endsWith('.ts'));
    expect(existsSync(scriptPath), scriptPath).toBe(true);
    expect(commandArguments, command).toContain(command);
  }
});

test('the product and development guides link to the compile instructions', () => {
  for (const path of ['README.md', 'ARCHITECTURE.md', 'docs/user-guide.md', 'docs/development.md']) {
    const text = readFileSync(path, 'utf8');
    expect(text, path).toMatch(/\]\((?:docs\/)?compile\.md\)/);
  }
});
