// Request scope construction stays at the authorization entry points.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const scopeOwners = new Set([
  'src/server/auth/operation-boundary.ts',
  'src/server/auth/request-authentication.ts',
  'src/server/auth/request-scope.ts',
  'src/server/auth/authorize.ts',
  'src/server/auth/dry-run.ts',
  'src/server/auth/access-admin.ts',
]);
const fixtureScripts = new Set([
  'scripts/security-review-server-cases.ts',
  'scripts/mutation-case.ts',
  'scripts/export-mutation-cases.ts',
  'scripts/session-security-mutation-cases.ts',
  'scripts/observability-cases.ts',
  'scripts/operation-boundary-mutation-cases.ts',
  'scripts/snapshot-mutation-cases.ts',
]);
const publicEntries = new Set(['operation-boundary', 'caller', 'twin-request', 'operation-inventory', 'call-attribution']);

function violations(path: string, source: string): string[] {
  const result: string[] = [];
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node) {
    const scopeCall = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'forRequest';
    const scopeAssignment = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(syntax).endsWith('[requestAccess]');
    const scopeProperty = ts.isPropertyAssignment(node) && node.name.getText(syntax) === '[requestAccess]';
    if ((scopeCall || scopeAssignment || scopeProperty) && !scopeOwners.has(path) && !fixtureScripts.has(path)) result.push(path + ': scope constructed outside the boundary');
    if (path.startsWith('src/server/mcp/') && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const imported = node.moduleSpecifier.text;
      if (imported.includes('/auth/') && !publicEntries.has(imported.split('/').at(-1)!)) result.push(path + ': private authorization import ' + imported);
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return result;
}

function sources(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

test('server and scripts construct scopes only at named boundaries and isolated test harnesses', () => {
  const failures = [...sources('src/server'), ...sources('scripts')].flatMap(path => violations(path, readFileSync(path, 'utf8')));
  expect(failures).toEqual([]);
});

test('a route cannot construct its own policy scope or import a private MCP evaluator', () => {
  expect(violations('src/server/routes/escape.ts', 'access.forRequest(principal);')).toHaveLength(1);
  expect(violations('src/server/routes/escape.ts', 'request[requestAccess] = scope;')).toHaveLength(1);
  expect(violations('src/server/mcp/escape.ts', "import { createAccessControl } from '../auth/authorize';")).toHaveLength(1);
  expect(violations('src/server/mcp/tools.ts', "import { buildTwinRequest } from '../auth/twin-request';")).toEqual([]);
});
