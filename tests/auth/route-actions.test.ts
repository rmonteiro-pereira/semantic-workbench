// Ensures the access inventory covers both declarations and executable HTTP routes.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { ROUTE_ACTIONS, routeFor } from '../../server/auth/route-actions';
import { routeExamples } from './route-actions';
import { testWorkspace } from '../helpers/temp-data-dir';

test('every example resolves to its own row and every row has an example', () => {
  expect(routeExamples).toHaveLength(ROUTE_ACTIONS.length);
  routeExamples.forEach((example, index) => {
    expect(routeFor(example.method, example.path)?.row).toBe(ROUTE_ACTIONS[index]);
  });
});
function assertRouteCoverage(text: string, file = 'synthetic.ts'): void {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node: ts.Node): void {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isStringLiteral(node.right) &&
      node.right.text.startsWith('/api/') &&
      /(?:pathname|path)$/.test(node.left.getText(source))
    ) {
      const path = node.right.text;
      expect(
        routeExamples.some(example => example.path === path),
        `${file}: ${node.right.text}`,
      ).toBe(true);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const literal = method === 'match' ? node.arguments[0] : node.expression.expression;
      if (
        ['match', 'exec', 'test'].includes(method) &&
        literal &&
        literal.kind === ts.SyntaxKind.RegularExpressionLiteral
      ) {
        const text = literal.getText(source);
        const pattern = text.slice(1, text.lastIndexOf('/'));
        if (pattern.startsWith('^\\/api') && pattern.endsWith('$')) {
          expect(
            routeExamples.some(example => new RegExp(pattern).test(example.path)),
            `${file}: ${text}`,
          ).toBe(true);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

test('every route literal in the server has an example request', () => {
  const files = [
    'server/handler.ts',
    ...readdirSync('server/routes')
      .filter(name => name.endsWith('.ts'))
      .map(name => `server/routes/${name}`),
  ];
  for (const file of files) assertRouteCoverage(readFileSync(file, 'utf8'), file);
});

test('route scan ignores formatting prefixes but refuses unmapped routes', () => {
  assertRouteCoverage("url.pathname.startsWith('/api/agent/')");
  assertRouteCoverage(String.raw`/^\/api\/agent\//.test(url.pathname)`);
  expect(() => assertRouteCoverage("url.pathname === '/api/unmapped'")).toThrow();
  for (const source of [
    String.raw`url.pathname.match(/^\/api\/unmapped$/)`,
    String.raw`/^\/api\/unmapped$/.test(url.pathname)`,
    String.raw`/^\/api\/unmapped$/.exec(url.pathname)`,
  ])
    expect(() => assertRouteCoverage(source)).toThrow();
});

test('handler retains the DNS rebinding explanation', () => {
  const source = readFileSync('server/handler.ts', 'utf8').replace(/\n\s*\/\/ /g, ' ');
  expect(source).toContain(
    'DNS rebinding: a page on another name resolved to 127.0.0.1 sends its own name as Host, and a ' +
      'same-origin GET carries no Origin. Only loopback names are served.',
  );
});
test('every implemented inventory example reaches a route in local mode', async () => {
  using workspace = await testWorkspace();
  for (const example of routeExamples) {
    // Public rows reserve handlers for the later authentication and health work.
    if (routeFor(example.method, example.path)!.row.public) continue;
    const controller = new AbortController();
    const request = new Request('http://localhost' + example.path, {
      method: example.method,
      signal: controller.signal,
      ...(example.method === 'GET' ? {} : { body: JSON.stringify(example.body ?? {}) }),
    });
    const response = await workspace.handler(request);
    if (example.path === '/api/events') {
      controller.abort();
      await response.body?.cancel();
      continue;
    }
    expect(await response.text(), `${example.method} ${example.path}`).not.toBe('Not found');
  }
});
