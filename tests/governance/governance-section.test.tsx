// Checks the governance section for each status, long text, the read-only and disabled cases, and the rules that choose what a person may set.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'yaml';
import { GovernanceSectionView, type GovernanceViewProps } from '../../src/app/governance/GovernanceSection';
import { planItemGovernance } from '../../src/app/governance/governance-save';
import { StatusMark } from '../../src/app/governance/StatusMark';
import { statusChoices, type StatusContext } from '../../src/app/governance/status-choices';
import { governanceOf } from '../../src/shared/governance/item-governance';

const noop = () => {};
const person: StatusContext = { me: null, local: true, canApprove: true, approveRequirement: '' };
const base = (status: string | undefined, extra: Record<string, string> = {}) => governanceOf({ tessera_governance: { ...(status ? { status } : {}), ...extra } });
const view = (governance: ReturnType<typeof base>, props: Partial<GovernanceViewProps> = {}) =>
  renderToStaticMarkup(
    <GovernanceSectionView
      governance={governance}
      choices={statusChoices(governance.status, person)}
      replacementChoices={['Account']}
      showClassification
      message=""
      saving={false}
      onSave={noop}
      {...props}
    />,
  );

test('every status shows a word and a shape, and the shapes differ', () => {
  const shapes = new Set<string>();
  for (const [status, word] of [
    ['proposed', 'proposed'],
    ['approved', 'approved'],
    ['deprecated', 'deprecated'],
    [undefined, 'not set'],
    ['draft', 'draft (older value)'],
    ['banana', 'unknown value'],
  ] as const) {
    const html = renderToStaticMarkup(<StatusMark status={status} />);
    expect(html).toContain(`>${word}<`);
    expect(html).toContain('aria-hidden="true"');
    shapes.add(html.match(/status-shape-(\w+)/)![1]);
  }
  expect(shapes).toEqual(new Set(['filled', 'outlined', 'struck', 'dashed']));
});

test('the status control offers only moves the lifecycle allows and turns off what the person may not do', () => {
  const editor: StatusContext = { me: null, local: false, canApprove: false, approveRequirement: 'Requires the Steward role' };
  const choices = statusChoices('proposed', editor);
  expect(choices.map(choice => [choice.value, choice.disabled])).toEqual([
    ['proposed', false],
    ['approved', true],
  ]);
  expect(choices[1].reason).toBe('Requires the Steward role');
  expect(statusChoices('approved', person).map(choice => choice.value)).toEqual(['approved', 'proposed', 'deprecated']);
  expect(statusChoices('deprecated', person).map(choice => choice.value)).toEqual(['deprecated', 'proposed']);
  expect(statusChoices('draft', person)[0]).toMatchObject({ value: 'draft', label: 'draft (older value)' });
});

test('a person who owns the item cannot approve it and is told why', () => {
  const me = { mode: 'server', verifiedEmail: 'dana@example.com', username: 'dana' } as any;
  const choices = statusChoices('proposed', { me, local: false, canApprove: true, approveRequirement: '', owner: 'Dana@Example.com' });
  expect(choices.find(choice => choice.value === 'approved')).toMatchObject({ disabled: true, reason: 'You own this item; another Steward decides' });
});

test('the deprecation fields appear for a deprecated item only and long reasons wrap in a textarea', () => {
  const long = 'A very long reason without a break. '.repeat(40);
  const deprecated = view(base('deprecated', { replaced_by: 'Account', deprecation_reason: long }));
  expect(deprecated).toContain('Reason for deprecating');
  expect(deprecated).toContain(long.trim());
  expect(view(base('proposed'))).not.toContain('Reason for deprecating');
});

test('classification is a declaration and the form says so', () => {
  expect(view(base('proposed'))).toContain('It does not limit who can read it.');
  expect(view(base('proposed'), { showClassification: false })).not.toContain('Classification');
});

test('read only shows the reason and the values, and the switched-off case says why', () => {
  const governance = base('approved', { owner: 'dana@example.com', steward: 'eli@example.com' });
  const readOnly = view(governance, { readOnlyReason: 'Requires the Editor role' });
  expect(readOnly).toContain('Requires the Editor role');
  expect(readOnly).toContain('dana@example.com');
  expect(readOnly).not.toContain('Save governance');
  const off = view(governance, { readOnlyReason: 'Editing governance is switched off in this build until its approval rules are active.' });
  expect(off).toContain('switched off');
});

test('loading, error and a second metric entry have their own messages', () => {
  expect(view(base(undefined), { state: { kind: 'loading' } })).toContain('Loading governance…');
  expect(view(base(undefined), { state: { kind: 'error', message: 'It failed.', retry: noop } })).toContain('Try again');
  expect(view({ ...base('approved'), secondEntryIgnored: true })).toContain('second workbench entry');
});

const SOURCE = 'tessera: 2\nversion: 0.2.0.dev0\nname: Retail\nontology:\n  - concept: Order\n    type: EntityType\n    description: A customer order.\n';

test('setting governance writes the entry, and removing every field removes the property', () => {
  const plan = planItemGovernance(SOURCE, 'a.yaml', ['ontology', 0], { status: 'proposed', owner: 'dana@example.com' });
  if ('refusal' in plan) throw new Error(plan.refusal);
  expect(parse(plan.source).ontology[0].tessera_governance).toEqual({ status: 'proposed', owner: 'dana@example.com' });
  expect(plan.source).toContain('description: A customer order.');
  const cleared = planItemGovernance(plan.source, 'a.yaml', ['ontology', 0], { status: '', owner: '' });
  if ('refusal' in cleared) throw new Error(cleared.refusal);
  expect(cleared.source).not.toContain('tessera_governance');
});

test('a replacement without the deprecated status and a document that is not at revision 2 are refused', () => {
  const noReason = planItemGovernance(SOURCE, 'a.yaml', ['ontology', 0], { status: 'proposed', replacedBy: 'Order' });
  expect('refusal' in noReason && noReason.refusal).toContain('belong to a deprecated item');
  const older = planItemGovernance(SOURCE.replace('tessera: 2', 'tessera: 1'), 'a.yaml', ['ontology', 0], { status: 'proposed' });
  expect('refusal' in older && older.refusal).toContain('revision 2');
});
