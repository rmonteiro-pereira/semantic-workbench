// Runs the assertions for the brand mutants against a candidate module. Each category exercises
// exactly the decisions of the module its mutants change.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadBrandBundle, setActiveBrand } from '../src/server/brand/bundle';

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg"';

function svgCase(candidate: any) {
  const wrap = (inner: string, attributes = '') => `${SVG_OPEN} ${attributes}>${inner}</svg>`;
  const clean = candidate.sanitizeSvg(wrap('<path d="M0 0" fill="#123456"/>'));
  assert(clean.includes('<path d="M0 0" fill="#123456"'));
  const hostile = candidate.sanitizeSvg(wrap('<script>alert(1)</script><foreignObject><p>x</p></foreignObject><circle r="1"/>'));
  assert(!/script|foreignObject|alert/.test(hostile));
  assert(hostile.includes('<circle'));
  const handler = candidate.sanitizeSvg(wrap('<rect onclick="alert(1)" width="1"/>', 'onload="x()"'));
  assert(!/onclick|onload|alert|x\(\)/.test(handler));
  const links = candidate.sanitizeSvg(wrap('<use href="https://evil.example/a.svg#b"/><image href="https://evil.example/p.png"/>'));
  assert(!links.includes('evil'));
  assert(candidate.sanitizeSvg(wrap('<use href="#shape"/>')).includes('href="#shape"'));
  const styled = candidate.sanitizeSvg(
    wrap(
      '<style>.a{fill:url(https://evil.example/x)}</style><style>.c{fill:red;behavior:x}</style>' +
        '<rect style="fill:url(//evil.example)" fill="url(#g)"/>' +
        '<rect fill="url(http://evil.example"/>',
    ),
  );
  assert(!styled.includes('evil'));
  assert(!styled.includes('behavior'));
  assert(styled.includes('fill="url(#g)"'));
  assert.throws(() => candidate.sanitizeSvg(`<!DOCTYPE svg [<!ENTITY a "b">]>${wrap('<g/>')}`));
  assert.throws(() => candidate.sanitizeSvg('<svg xmlns="http://example.org/x"><g/></svg>'));
  const namespacedLinks = candidate.sanitizeSvg(
    wrap(
      '<use xmlns:x="http://www.w3.org/1999/xlink" x:href="https://evil.example/a#b"/>' +
        '<use xmlns:q="http://example.org/q" q:href="//evil.example/a#b" q:run="1"/>' +
        '<text xml:space="preserve" onclick="x()">a</text>',
    ),
  );
  assert(!/evil|q:run|onclick/.test(namespacedLinks));
  assert(namespacedLinks.includes('xml:space="preserve"'));
  const prolog = candidate.sanitizeSvg(`<?xml-stylesheet href="https://evil.example/x.css"?><!-- c -->${wrap('<!-- d --><g/>')}`);
  assert(prolog.startsWith('<svg') && !/evil|xml-stylesheet|<!--/.test(prolog));
  for (const value of ['u\\72l(x)', "image('x')", "src('x')", 'cross-fade(red, blue)']) {
    const styled = candidate.sanitizeSvg(wrap(`<style>.a{background:${value}}</style><rect style="background:${value}"/>`));
    assert(!styled.includes('<style') && !styled.includes('style='), value);
  }
  const foreign = candidate.sanitizeSvg(`${SVG_OPEN}><g xmlns="http://www.w3.org/1999/xhtml"><circle r="1"/></g><circle r="2"/></svg>`);
  assert(!foreign.includes('xhtml'));
}

function cssCase(candidate: any) {
  const kept = candidate.sanitizeBrandCss(
    ":root { --color-accent: #123456 }\n:root[data-theme='dark'] { --color-accent: #abcdef }\n" + '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --a: 1px } }',
  );
  assert.deepEqual(kept.dropped, []);
  assert(kept.css.includes('--color-accent: #123456;'));
  assert(kept.css.includes('@media (prefers-color-scheme: dark)'));
  const mixed = candidate.sanitizeBrandCss(
    'body { --color-accent: red } :root, body { --color-accent: blue }\n' + '@media (min-width: 10px) { :root { --color-accent: green } }\n' + '@font-face { src: url(x) } @import url(x);',
  );
  assert.equal(mixed.css, '');
  const values = candidate.sanitizeBrandCss(':root { color: red; --ok: #111111; --a: url(x); --b: image-set("x" 1x); --c: expression(1) }');
  assert.equal(values.css, ':root {\n  --ok: #111111;\n}\n');
  assert.throws(() => candidate.sanitizeBrandCss(':root { --a: red'));
  const escaped = candidate.sanitizeBrandCss(":root { --a: \\75 rl(x); --b: cross-fade(red, blue); --c: src('x'); --ok: #111111 }");
  assert.equal(escaped.css, ':root {\n  --ok: #111111;\n}\n');
  const unbalanced = candidate.sanitizeBrandCss(':root { --a: calc(1px; --b: 1px); --e: 1px) (2px; --c: "red; --d: \'x" y"; --ok: #111111 }');
  assert.equal(unbalanced.css, ':root {\n  --ok: #111111;\n}\n');
}

function valuesCase(candidate: any) {
  for (const value of ['u\\72l(x)', 'url(https://x.example)', "image('x')", "image-set('x' 1x)", 'cross-fade(red, blue)', "src('x')", '@import x', 'expression(1)', 'javascript:1']) {
    assert(candidate.hasForbiddenValue(value), value);
  }
  assert(!candidate.hasForbiddenValue('#111111'));
  assert(!candidate.hasForbiddenValue('color-mix(in srgb, red 10%, white)'));
  assert(candidate.hasForbiddenValue('url(#gradient)'));
  assert(!candidate.hasForbiddenValue('url(#gradient)', { allowLocalUrl: true }));
  assert(candidate.hasForbiddenValue('url(https://x.example)', { allowLocalUrl: true }));
  assert(candidate.hasForbiddenValue('url(#a) url(https://x.example)', { allowLocalUrl: true }));
}

function activeCase(candidate: any) {
  candidate.resetActiveBrand();
  assert.throws(() => candidate.activeBrand(), /not been loaded/);
  const bundle = { files: new Map(), manifest: { productName: 'A', shortName: 'A' } };
  candidate.setActiveBrand(bundle);
  assert.equal(candidate.activeBrand(), bundle);
  candidate.resetActiveBrand();
  assert.throws(() => candidate.activeBrand());
}

function manifestCase(candidate: any) {
  const text = (value: object) => JSON.stringify(value);
  const base = { productName: 'Acme', shortName: 'A' };
  assert.deepEqual(candidate.parseBrandManifest(text(base)), base);
  assert.throws(() => candidate.parseBrandManifest(text({ shortName: 'A' })));
  assert.throws(() => candidate.parseBrandManifest(text({ ...base, productName: 'x'.repeat(61) })));
  assert.throws(() => candidate.parseBrandManifest(text({ ...base, shortName: 'x'.repeat(25) })));
  assert.throws(() => candidate.parseBrandManifest(text({ ...base, productName: 'a\nb' })));
  assert.throws(() => candidate.parseBrandManifest(text({ ...base, supportUrl: 'javascript:1' })));
  assert.equal(candidate.parseBrandManifest(text({ ...base, supportUrl: 'https://x.example/' })).supportUrl, 'https://x.example/');
}

function filesCase(candidate: any) {
  assert.equal(candidate.isBrandFileName('logo.svg'), true);
  assert.equal(candidate.isBrandFileName('secret.txt'), false);
  assert.equal(candidate.isBrandFileName('../logo.svg'), false);
  assert.equal(candidate.maxBytesOf('logo.svg'), 256 * 1024);
  assert.equal(candidate.maxBytesOf('brand.json'), 64 * 1024);
  assert.equal(candidate.MAX_IMAGE_BYTES, 256 * 1024);
  assert.equal(candidate.contentSecurityPolicyOf('logo.svg'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  for (const name of ['brand.json', 'brand.css']) {
    assert.equal(candidate.contentSecurityPolicyOf(name), "default-src 'none'; sandbox");
  }
}

function bundleCase(candidate: any) {
  const folder = mkdtempSync(join(tmpdir(), 'workbench-brand-mutant-'));
  const outside = mkdtempSync(join(tmpdir(), 'workbench-brand-outside-'));
  const warnings: string[] = [];
  const good = `${SVG_OPEN}><circle r="4" fill="#abcdef"/></svg>`;
  try {
    const defaults = resolve('public/brand');
    const options = { directory: folder, defaults, warn: (line: string) => warnings.push(line) };
    writeFileSync(join(folder, 'brand.json'), '{"productName":"Acme","shortName":"A","extra":1}');
    writeFileSync(join(folder, 'favicon.svg'), good);
    writeFileSync(join(folder, 'logo.svg'), good.replace('</svg>', `<!--${'x'.repeat(262144)}--></svg>`));
    writeFileSync(join(outside, 'logo-mark.svg'), good);
    symlinkSync(join(outside, 'logo-mark.svg'), join(folder, 'logo-mark.svg'));
    writeFileSync(join(folder, 'brand.css'), 'body{x:y} :root{--color-accent:#102030}');
    writeFileSync(join(folder, 'secret.txt'), 'private');
    const bundle = candidate.loadBrandBundle(options);
    assert.equal(bundle.manifest.productName, 'Acme');
    assert(!bundle.files.get('brand.json').body.includes('extra'));
    assert(bundle.files.get('favicon.svg').body.includes('#abcdef'));
    assert(!bundle.files.get('logo.svg').body.includes('#abcdef'), 'oversized logo accepted');
    assert(!bundle.files.get('logo-mark.svg').body.includes('#abcdef'), 'outside symlink followed');
    assert.equal(bundle.files.get('brand.css').body, ':root {\n  --color-accent: #102030;\n}\n');
    assert(warnings.some(line => line.startsWith('brand.css:')));
    assert(!bundle.files.has('secret.txt'));
  } finally {
    rmSync(folder, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
}

function servedFileCase(candidate: any) {
  setActiveBrand(loadBrandBundle({ defaults: resolve('public/brand') }));
  const request = (method = 'GET') => new Request('http://localhost/brand/logo.svg', { method });
  const response = candidate.serveBrand(request(), '/brand/logo.svg', new Headers());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/svg+xml');
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  const stylesheet = candidate.serveBrand(request(), '/brand/brand.css', new Headers());
  assert.equal(stylesheet.headers.get('Content-Security-Policy'), "default-src 'none'; sandbox");
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(candidate.serveBrand(request(), '/brand/secret.txt', new Headers()).status, 404);
  assert.equal(candidate.serveBrand(request(), '/brand/toString', new Headers()).status, 404);
  assert.equal(candidate.serveBrand(request('POST'), '/brand/logo.svg', new Headers()).status, 405);
  assert.equal(candidate.serveBrand(request(), '/assets/app.js', new Headers()), null);
}

function checkCase(candidate: any) {
  const found = candidate.brandViolationsIn('src/a.tsx', "const a = 'Semantic Workbench';\nsemantic<small>WORKBENCH</small>\nM12.83 2.18a2");
  assert.deepEqual(
    found.map((item: any) => `${item.line}:${item.rule}`),
    ['1:product-name', '2:wordmark', '3:logo-path'],
  );
  assert.deepEqual(candidate.brandViolationsIn('src/server/projects/git.ts', "name: 'Semantic Workbench'"), []);
  assert.equal(candidate.brandViolationsIn('server/other.ts', "name: 'Semantic Workbench'").length, 1);
  assert.deepEqual(candidate.brandViolationsIn('src/a.ts', "'semantic-workbench/metric/v1'"), []);
}

/** Runs the case of one brand mutant category against the candidate module. */
export function brandMutationCase(candidate: unknown, category: string) {
  if (category === 'brand-svg') svgCase(candidate);
  if (category === 'brand-css') cssCase(candidate);
  if (category === 'brand-manifest') manifestCase(candidate);
  if (category === 'brand-values') valuesCase(candidate);
  if (category === 'brand-active') activeCase(candidate);
  if (category === 'brand-files') filesCase(candidate);
  if (category === 'brand-bundle') bundleCase(candidate);
  if (category === 'brand-route') servedFileCase(candidate);
  if (category === 'brand-check') checkCase(candidate);
}
