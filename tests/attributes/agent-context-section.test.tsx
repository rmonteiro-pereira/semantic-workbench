// Checks the agent context form: three separate fields, a preview of what an agent receives, the publish note, and the conversion between fields and the stored value.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentContextSectionView } from '../../src/app/agent-context/AgentContextSection';
import { contextOfFields, contextProblem, fieldsOfContext } from '../../src/shared/governance/agent-context-edit';

const noop = () => {};
const render = (value: unknown, props: Partial<Parameters<typeof AgentContextSectionView>[0]> = {}) =>
  renderToStaticMarkup(<AgentContextSectionView initial={fieldsOfContext(value)} message="" saving={false} onSave={noop} {...props} />);

test('the three fields are separate and the preview shows the entry an agent receives', () => {
  const html = render({ instructions: 'Prefer the tier.', synonyms: ['client'], examples: ['How many gold customers?'] });
  for (const label of ['Instructions', 'Synonyms', 'Examples']) expect(html).toContain(`<span>${label}</span>`);
  expect(html).toContain('&quot;synonyms&quot;: [');
  expect(html).toContain('Agents read this text only from the published version');
  expect(html).toContain('This preview shows your working copy.');
});

test('an item with no context says an agent receives none', () => {
  expect(render(undefined)).toContain('An agent receives no context for this item.');
});

test('read only shows the reason and no save button, and loading and error states exist', () => {
  const readOnly = render('Text', { readOnlyReason: 'Requires the Editor role' });
  expect(readOnly).toContain('Requires the Editor role');
  expect(readOnly).not.toContain('Save agent context');
  expect(render('Text')).toContain('Save agent context');
  expect(render('Text', { state: { kind: 'loading' } })).toContain('Loading agent context…');
  expect(render('Text', { state: { kind: 'error', message: 'No.', retry: noop } })).toContain('Try again');
});

test('a plain text is the instructions and a lone instruction is stored as text', () => {
  expect(fieldsOfContext('Use it.')).toEqual({ instructions: 'Use it.', synonyms: '', examples: '' });
  expect(contextOfFields({ instructions: ' Use it. ', synonyms: '', examples: '' })).toBe('Use it.');
  expect(contextOfFields({ instructions: '', synonyms: 'a\n\n b ', examples: '' })).toEqual({ synonyms: ['a', 'b'] });
  expect(contextOfFields({ instructions: '', synonyms: '', examples: '' })).toBeUndefined();
});

test('a text over the limit is a problem the form names', () => {
  expect(contextProblem({ instructions: 'x'.repeat(10_001), synonyms: '', examples: '' })).toContain('at most 10,000 characters');
  expect(contextProblem({ instructions: 'fine', synonyms: '', examples: '' })).toBeNull();
});

test('long instructions are rendered in full', () => {
  const long = 'unbroken'.repeat(500);
  expect(render(long)).toContain(long);
});
