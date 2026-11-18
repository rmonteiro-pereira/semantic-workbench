// Checks the three sections in every state they must have, and that their styles never clip, cut or fix a width. Real clipping is measured in the browser check.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentContextSectionView } from '../../src/app/agent-context/AgentContextSection';
import { AttributeListView } from '../../src/app/attributes/AttributeList';
import { GovernanceSectionView } from '../../src/app/governance/GovernanceSection';
import { statusChoices } from '../../src/app/governance/status-choices';
import { governanceOf } from '../../src/shared/governance/item-governance';
import type { AttributeEntry } from '../../src/shared/attributes/attribute-rule';

const noop = () => {};
const LONG = 'A_name_with_no_breaks_at_all_'.repeat(20);
const entry: AttributeEntry = { name: LONG, relationship: { description: LONG, verbalizes: [LONG] }, relationshipIndex: 0, valueType: LONG };
const states = [
  ['loading', { kind: 'loading' as const }],
  ['error', { kind: 'error' as const, message: LONG, retry: noop }],
] as const;

const attributes = (props: Partial<Parameters<typeof AttributeListView>[0]> = {}) =>
  renderToStaticMarkup(<AttributeListView entries={[]} state={{ kind: 'ready' }} canEdit message="" onAdd={noop} onEdit={noop} onMove={noop} onRemove={noop} {...props} />);
const governance = (props: Partial<Parameters<typeof GovernanceSectionView>[0]> = {}) => {
  const value = governanceOf({ tessera_governance: { status: 'deprecated', deprecation_reason: LONG, owner: LONG } });
  return renderToStaticMarkup(
    <GovernanceSectionView
      governance={value}
      choices={statusChoices(value.status, { me: null, local: true, canApprove: true, approveRequirement: '' })}
      replacementChoices={[]}
      showClassification
      message=""
      saving={false}
      onSave={noop}
      {...props}
    />,
  );
};
const context = (props: Partial<Parameters<typeof AgentContextSectionView>[0]> = {}) =>
  renderToStaticMarkup(<AgentContextSectionView initial={{ instructions: LONG, synonyms: LONG, examples: LONG }} message="" saving={false} onSave={noop} {...props} />);

for (const [name, state] of states) {
  test(`the three sections have a ${name} state`, () => {
    const marker = name === 'loading' ? 'Loading' : 'Try again';
    expect(attributes({ state })).toContain(marker);
    expect(governance({ state })).toContain(marker);
    expect(context({ state })).toContain(marker);
  });
}

test('empty and read only states say what is missing or why', () => {
  expect(attributes()).toContain('No attributes yet');
  expect(attributes({ canEdit: false, editNote: 'Requires the Editor role' })).toContain('Requires the Editor role');
  expect(governance({ readOnlyReason: 'Requires the Editor role' })).toContain('Requires the Editor role');
  expect(context({ readOnlyReason: 'Requires the Editor role' })).toContain('Requires the Editor role');
});

test('long text is rendered whole in every section', () => {
  expect(attributes({ entries: [entry] }).split(LONG).length - 1).toBeGreaterThanOrEqual(4);
  expect(governance()).toContain(LONG);
  expect(context()).toContain(LONG);
});

for (const file of ['src/app/attributes/attributes.css', 'src/app/governance/governance.css', 'src/app/agent-context/agent-context.css']) {
  test(`${file} never cuts text and never fixes a width`, () => {
    const css = readFileSync(file, 'utf8');
    expect(css).not.toMatch(/text-overflow/);
    expect(css).not.toMatch(/line-clamp/);
    expect(css).not.toMatch(/(?<![-\w])width:\s*\d/);
    expect(css).not.toMatch(/white-space:\s*nowrap/);
    expect(css).not.toMatch(/overflow:\s*hidden/);
  });
}

test('the status is a word and a shape, never a colour alone, and the word uses the plain text colour', () => {
  const css = readFileSync('src/app/governance/governance.css', 'utf8');
  expect(css).toMatch(/\.status-mark\s*{[^}]*color: var\(--color-text\)/);
  expect(governance()).toContain('status-shape-struck');
});
