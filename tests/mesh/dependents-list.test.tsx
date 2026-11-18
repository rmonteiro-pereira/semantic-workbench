import { expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DependentsContent } from '../../src/app/mesh/DependentsList';
import { DisclosureNotice } from '../../src/app/mesh/DisclosureNotice';

test('published dependents have empty, loading and error states', () => {
  expect(renderToStaticMarkup(<DependentsContent state={{ status: 'ready', value: [] }} />)).toContain('No published project');
  expect(renderToStaticMarkup(<DependentsContent state={{ status: 'loading' }} />)).toContain('Loading published dependents');
  expect(renderToStaticMarkup(<DependentsContent state={{ status: 'error', message: 'Unavailable' }} />)).toContain('role="alert"');
});

test('dependent names and versions stay whole and the disclosure names the only visible fields', () => {
  const name = 'Long importing project name '.repeat(8).trim();
  const version = 'b'.repeat(40);
  const html = renderToStaticMarkup(<DependentsContent state={{ status: 'ready', value: [{ name, domain: null, items: ['Invoice'], version }] }} />);
  expect(html).toContain(name);
  expect(html).toContain('No domain');
  expect(html).toContain(version);
  const notice = renderToStaticMarkup(<DisclosureNotice />);
  expect(notice).toContain('people who can publish the provider');
  expect(notice).toContain('name and domain, the imported public items and the resolved version');
});
