// Attribution is validated before it can change the durable chain or its mirror.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createAuditLog, type AuditInput } from '../../src/server/auth/audit';
import { testWorkspace } from '../helpers/temp-data-dir';

/** Complete audit input used to detect fields omitted by serialization. */
export const attributedInput: AuditInput = {
  requestId: 'attribution',
  principal: { id: 'person', kind: 'person', name: 'Person', clientId: 'client' },
  action: 'read',
  resource: { type: 'project', project: 'sales' },
  decision: 'allow',
  rules: ['read'],
  reason: 'allowed',
  outcome: 'ok',
  version: 'version',
  suppressed: 2,
  origin: 'mcp',
  tool: 'projects.list',
  connection: 'connection_1-A',
  method: 'tools/call',
  clientLabel: 'reference client',
  result: 'ok',
  publication: { previous: 'a'.repeat(40), commit: 'b'.repeat(40) },
  snapshot: { grants: ['grant'], roles: ['reader'], groups: ['group'], emailMatched: false, resourceAttrs: { type: 'project', project: 'sales' } },
};

test('attribution accepts the fixed vocabularies and HTTP remains implicit', async () => {
  using fixture = await testWorkspace();
  const audit = createAuditLog({ dir: join(fixture.root, 'origins') });
  expect(audit.append(attributedInput)).toMatchObject(attributedInput);
  expect(audit.append({ ...attributedInput, origin: 'mcp' }).origin).toBe('mcp');
  expect(audit.append({ ...attributedInput, origin: 'acp' }).origin).toBe('acp');
  expect(audit.append({ ...attributedInput, origin: 'http' }).origin).toBeUndefined();
});

test('invalid attribution writes neither a record nor a mirror anchor', async () => {
  using fixture = await testWorkspace();
  const mirrored: string[] = [];
  let now = new Date('2026-01-31T23:00:00Z');
  const audit = createAuditLog({ dir: join(fixture.root, 'invalid-origin'), now: () => now, mirror: line => mirrored.push(line) });
  audit.append(attributedInput);
  const cases = [
    { origin: 'browser' },
    { origin: null },
    { tool: 'unknown.tool' },
    { tool: '/api/projects' },
    { connection: '' },
    { connection: 'a/b' },
    { connection: 'a'.repeat(65) },
    { method: 'resources/read' },
    { clientLabel: 'x'.repeat(65) },
    { clientLabel: 'line\nbreak' },
    { result: 'maybe' },
  ];
  now = new Date('2026-02-01T00:00:00Z');
  for (const invalid of cases) expect(() => audit.append({ ...attributedInput, ...invalid } as AuditInput)).toThrow('Invalid audit');
  expect(audit.entries('2026-02')).toEqual([]);
  expect(mirrored).toHaveLength(1);
});

import ts from 'typescript';

test('every declared audit input field has an explicit serializer disposition', async () => {
  using fixture = await testWorkspace();
  const syntax = ts.createSourceFile('audit.ts', await Bun.file('src/server/auth/audit.ts').text(), ts.ScriptTarget.Latest, true);
  const declaration = syntax.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === 'AuditInput');
  if (!declaration || !ts.isTypeAliasDeclaration(declaration) || !ts.isTypeLiteralNode(declaration.type)) throw Error('AuditInput must declare its serializer fields.');
  const fields = declaration.type.members.filter(ts.isPropertySignature).map(member => member.name.getText(syntax));
  const intentionallyNotStored: string[] = [];
  expect(Object.keys(attributedInput).sort()).toEqual(fields.sort());
  const stored = createAuditLog({ dir: join(fixture.root, 'complete-audit') }).append(attributedInput);
  for (const field of fields) {
    if (intentionallyNotStored.includes(field)) continue;
    expect(Object.hasOwn(stored, field), field + ' must be stored').toBe(true);
    expect(stored[field], field).toEqual(attributedInput[field]);
  }
});
