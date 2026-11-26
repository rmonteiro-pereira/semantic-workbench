// Editable Admin screens say whether a change is unsaved, why it cannot be reviewed yet, and when it was saved.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SavedNote, UnsavedChangesNote } from '../src/app/admin/SaveStatus';
import { ReviewChange } from '../src/app/admin/ReviewChange';

test('a saved change says so with its time', () => {
  const html = renderToStaticMarkup(<SavedNote at={new Date(2026, 10, 27, 14, 5)} />);
  expect(html).toContain('role="status"');
  expect(html).toMatch(/Saved at .*0?2:05|Saved at 14:05/);
  expect(renderToStaticMarkup(<SavedNote at={null} />)).toBe('');
});

test('a draft with changes says they are not saved and names the button that saves them', () => {
  expect(renderToStaticMarkup(<UnsavedChangesNote action="Review change" />)).toContain('Unsaved changes. Use Review change to save them.');
  const dirty = renderToStaticMarkup(<ReviewChange area="projects" proposal={{ grants: [] }} baseVersion="v1" onSaved={() => {}} dirty />);
  expect(dirty).toContain('Unsaved changes.');
  const clean = renderToStaticMarkup(<ReviewChange area="projects" proposal={{ grants: [] }} baseVersion="v1" onSaved={() => {}} />);
  expect(clean).not.toContain('Unsaved changes.');
});

test('an unavailable review says why instead of only greying its button', () => {
  const html = renderToStaticMarkup(<ReviewChange area="policies" proposal={{ grants: [] }} baseVersion="v1" onSaved={() => {}} disabled unavailableReason="Validate the rule first." />);
  expect(html).toContain('Validate the rule first.');
});
