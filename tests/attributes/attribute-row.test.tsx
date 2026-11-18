// Checks the attribute row wraps long text, offers an annotation slot that features fill, and never clips.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttributeRow } from '../../src/app/attributes/AttributeRow';

const LONG_NAME = 'a_remarkably_long_attribute_name_'.repeat(8);

test('a long name, type, reading and description are all rendered in full', () => {
  const html = renderToStaticMarkup(<AttributeRow name={LONG_NAME} valueType={LONG_NAME.toUpperCase()} reading={`Customer has ${LONG_NAME}`} description={`Explains ${LONG_NAME}`} />);
  for (const text of [LONG_NAME, LONG_NAME.toUpperCase(), `Customer has ${LONG_NAME}`, `Explains ${LONG_NAME}`]) expect(html).toContain(text);
});

test('an empty slot adds no wrapper and a filled slot renders after the text', () => {
  const empty = renderToStaticMarkup(<AttributeRow name="email" valueType="String" />);
  expect(empty).not.toContain('attribute-annotations');
  const filled = renderToStaticMarkup(<AttributeRow name="email" valueType="String" reading="Customer has email" annotations={<span className="mark">42 requests</span>} />);
  expect(filled).toContain('<div class="attribute-annotations"><span class="mark">42 requests</span></div>');
  expect(filled.indexOf('Customer has email')).toBeLessThan(filled.indexOf('42 requests'));
});

test('an inherited row names the concept that declares the attribute and links to it when it can', () => {
  const plain = renderToStaticMarkup(<AttributeRow name="name" valueType="String" inheritedFrom="Party" />);
  expect(plain).toContain('Inherited from Party');
  expect(plain).not.toContain('<button');
  const linked = renderToStaticMarkup(<AttributeRow name="name" valueType="String" inheritedFrom="Party" onOpenInheritedFrom={() => {}} />);
  expect(linked).toContain('<button');
});

test('the styles hold no ellipsis, line clamp or fixed label width', () => {
  const css = readFileSync('src/app/attributes/attributes.css', 'utf8');
  expect(css).not.toMatch(/text-overflow/);
  expect(css).not.toMatch(/line-clamp/);
  expect(css).not.toMatch(/(?<![-\w])width:\s*\d/);
  expect(css).not.toMatch(/white-space:\s*nowrap/);
});
