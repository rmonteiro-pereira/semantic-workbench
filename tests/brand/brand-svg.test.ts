// Tests that a brand SVG can only draw: scripts, foreign content, handlers and outside
// references are removed, and a file that is not an SVG is refused.
import { expect, test } from 'bun:test';
import { sanitizeSvg } from '../../src/server/brand/sanitize-svg';

const NAMESPACE = 'xmlns="http://www.w3.org/2000/svg"';

function svg(inner: string, rootAttributes = '') {
  return `<svg ${NAMESPACE} ${rootAttributes} viewBox="0 0 10 10">${inner}</svg>`;
}

test('a plain drawing keeps its shapes and styles', () => {
  const clean = sanitizeSvg(svg('<path d="M0 0h10" fill="#123456"/><title>Logo</title>'));
  expect(clean).toContain('<path d="M0 0h10" fill="#123456"');
  expect(clean).toContain('<title>Logo</title>');
});

test('scripts and foreign content are removed with everything inside them', () => {
  const clean = sanitizeSvg(
    svg('<script>alert(1)</script><foreignObject><div>x</div></foreignObject>' + '<animate attributeName="href" to="javascript:alert(1)"/><a href="https://evil.example"/>' + '<circle r="1"/>'),
  );
  for (const forbidden of ['script', 'foreignObject', 'animate', 'evil']) {
    expect(clean).not.toContain(forbidden);
  }
  expect(clean).toContain('<circle');
});

test('event handlers are removed from the root and from shapes', () => {
  const clean = sanitizeSvg(svg('<rect onclick="alert(1)" width="1"/>', 'onload="alert(2)"'));
  expect(clean).not.toMatch(/onload|onclick|alert/);
  expect(clean).toContain('<rect width="1"');
});

test('links may only point inside the drawing', () => {
  const clean = sanitizeSvg(svg('<use href="https://evil.example/x.svg#a"/><use xlink:href="#shape" ' + 'xmlns:xlink="http://www.w3.org/1999/xlink"/>' + '<image href="https://evil.example/p.png"/>'));
  expect(clean).not.toContain('evil');
  expect(clean).toContain('xlink:href="#shape"');
});

test('an embedded raster image is allowed, a data document is not', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  expect(sanitizeSvg(svg(`<image href="${png}"/>`))).toContain(png);
  const html = 'data:text/html;base64,PHNjcmlwdD4=';
  expect(sanitizeSvg(svg(`<image href="${html}"/>`))).not.toContain('data:text/html');
});

test('style rules and attributes may not load anything', () => {
  const clean = sanitizeSvg(
    svg(
      '<style>.a{fill:url(https://evil.example/x)}</style>' +
        '<style>.b{fill:red}</style>' +
        '<rect style="fill:url(//evil.example/x)" fill="url(#gradient)" width="1"/>' +
        '<rect fill="url(http://evil.example" width="2"/>',
    ),
  );
  expect(clean).not.toContain('evil');
  expect(clean).toContain('.b{fill:red}');
  expect(clean).toContain('fill="url(#gradient)"');
});

test('a document type or entity declaration is refused', () => {
  const bomb = `<!DOCTYPE svg [<!ENTITY a "aaaa">]>${svg('<text>&a;</text>')}`;
  expect(() => sanitizeSvg(bomb)).toThrow('DOCTYPE');
});

test('input that is not an SVG image is refused', () => {
  expect(() => sanitizeSvg('<html><body>x</body></html>')).toThrow('not an SVG');
  expect(() => sanitizeSvg('<svg xmlns="http://example.org/x"/>')).toThrow('xmlns');
  expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')).toThrow('well-formed');
  expect(() => sanitizeSvg('')).toThrow();
});

test('a link is decided by its local name, whatever namespace the prefix is bound to', () => {
  const clean = sanitizeSvg(
    svg(
      '<use xmlns:x="http://www.w3.org/1999/xlink" x:href="https://evil.example/a.svg#b"/>' +
        '<use xmlns:q="http://example.org/q" q:href="//evil.example/a.svg#b"/>' +
        '<use xmlns:x="http://www.w3.org/1999/xlink" x:href="#local"/>',
    ),
  );
  expect(clean).not.toContain('evil');
  expect(clean).toContain('x:href="#local"');
});

test('other namespaced attributes are removed, xmlns and xml:space stay', () => {
  const clean = sanitizeSvg(svg('<text xmlns:q="http://example.org/q" q:action="run" xml:space="preserve">a</text>'));
  expect(clean).not.toContain('q:action');
  expect(clean).toContain('xmlns:q=');
  expect(clean).toContain('xml:space="preserve"');
});

test('only the root element is written out, without prolog nodes or comments', () => {
  const clean = sanitizeSvg('<?xml version="1.0"?><?xml-stylesheet href="https://evil.example/x.css"?><!-- note -->' + svg('<!-- inner --><g/>'));
  expect(clean.startsWith('<svg')).toBe(true);
  expect(clean).not.toMatch(/evil|xml-stylesheet|note|inner/);
});

test('styles cannot use escapes or resource functions', () => {
  for (const value of ['u\\72l(https://evil.example)', 'image(https://evil.example)', "image-set('https://evil.example' 1x)", 'cross-fade(red, blue)', "src('https://evil.example')"]) {
    const clean = sanitizeSvg(svg(`<style>.a{background:${value}}</style><rect style="background:${value}" width="1"/>`));
    expect(clean).not.toContain('evil');
    expect(clean).not.toContain('<style');
    expect(clean).not.toContain('style=');
  }
});
