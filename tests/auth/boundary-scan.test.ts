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
// The agent panel may use these two pieces of the model-protocol surface and nothing else from it.
const sharedMcpEntries = new Set(['call-limits', 'local-capability']);
const publicEntries = new Set(['operation-boundary', 'caller', 'twin-request', 'operation-inventory', 'call-attribution', 'operation-outcome']);
// These identity and audit symbols do not evaluate access or construct a request scope.
const panelInfrastructureImports: Record<string, readonly string[]> = {
  'src/server/acp/panel-service.ts:../auth/audit': ['reportAuditFailure'],
  'src/server/acp/panel-service.ts:../auth/rate-limit': ['createAnonymousAuditGate'],
  'src/server/acp/panel-service.ts:../auth/refusal': ['auditDenial'],
  'src/server/acp/relay-authentication.ts:../auth/principal': ['localPrincipal'],
};

/** Accepts only the named infrastructure symbols at their existing owning module. */
function panelInfrastructureImport(path: string, node: ts.ImportDeclaration): boolean {
  const allowed = panelInfrastructureImports[path + ':' + (node.moduleSpecifier as ts.StringLiteral).text];
  const bindings = node.importClause?.namedBindings;
  if (!allowed || node.importClause?.name || !bindings || !ts.isNamedImports(bindings)) return false;
  return bindings.elements.every(element => element.isTypeOnly || allowed.includes(element.propertyName?.text ?? element.name.text));
}

test('panel infrastructure exceptions cannot import access decisions or move to another module', () => {
  expect(violations('src/server/acp/panel-service.ts', "import { auditDenial } from '../auth/refusal';")).toEqual([]);
  expect(violations('src/server/acp/panel-service.ts', "import { createAccessControl } from '../auth/refusal';")).toHaveLength(1);
  expect(violations('src/server/acp/x.ts', "import { auditDenial } from '../auth/refusal';")).toHaveLength(1);
});

/** The agent panel reaches authorization only through public entries, mints callers in one module and borrows only two modules from the model-protocol surface. */
function panelImportViolations(path: string, node: ts.ImportDeclaration): string[] {
  const imported = (node.moduleSpecifier as ts.StringLiteral).text;
  const name = imported.split('/').at(-1)!;
  const typeOnly = node.importClause?.isTypeOnly === true;
  const found: string[] = [];
  if (imported.includes('/mcp/') && !sharedMcpEntries.has(name)) found.push(path + ': import of a model-protocol module ' + imported);
  if (imported.includes('/auth/') && !publicEntries.has(name) && !typeOnly && !panelInfrastructureImport(path, node)) found.push(path + ': private authorization import ' + imported);
  const importsMint =
    node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.some(element => element.name.text === 'mintCaller');
  if (importsMint && path !== 'src/server/acp/connection-auth.ts') found.push(path + ': a caller is minted outside connection-auth');
  return found;
}

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
    if (path.startsWith('src/server/acp/') && ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) result.push(...panelImportViolations(path, node));
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

test('the agent panel may not import model-protocol modules, private authorization or mint callers elsewhere', () => {
  expect(violations('src/server/acp/x.ts', "import { createMcpHandler } from '../mcp/server-factory';")).toHaveLength(1);
  expect(violations('src/server/acp/x.ts', "import { createCallLimits } from '../mcp/call-limits';")).toEqual([]);
  expect(violations('src/server/acp/x.ts', "import { openLocalCapability } from '../mcp/local-capability';")).toEqual([]);
  expect(violations('src/server/acp/x.ts', "import { createAccessControl } from '../auth/authorize';")).toHaveLength(1);
  expect(violations('src/server/acp/x.ts', "import type { Session } from '../auth/sessions';")).toEqual([]);
  expect(violations('src/server/acp/x.ts', "import { mintCaller } from '../auth/caller';")).toHaveLength(1);
  expect(violations('src/server/acp/connection-auth.ts', "import { mintCaller } from '../auth/caller';")).toEqual([]);
  expect(violations('src/server/acp/x.ts', 'access.forRequest(principal);')).toHaveLength(1);
});
