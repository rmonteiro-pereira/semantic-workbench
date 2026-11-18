// Checks the metric view of the governance section: reading changes no byte, one edit changes only the status bytes, and a second entry is reported.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'yaml';
import { GovernanceSectionView } from '../../src/app/governance/GovernanceSection';
import { planMetricGovernance } from '../../src/app/governance/governance-save';
import { statusChoices } from '../../src/app/governance/status-choices';
import { metricGovernanceOf } from '../../src/shared/governance/item-governance';

const source = readFileSync('tests/fixtures/tessera/additions/project/semantic-model.yaml', 'utf8');
const metrics: any[] = parse(source).metrics;
const person = { me: null, local: true, canApprove: true, approveRequirement: '' };
const render = (metric: any) => {
  const governance = metricGovernanceOf(metric);
  return renderToStaticMarkup(
    <GovernanceSectionView governance={governance} choices={statusChoices(governance.status, person)} replacementChoices={[]} showClassification={false} message="" saving={false} onSave={() => {}} />,
  );
};

test('each legacy status is shown with its own words and viewing writes nothing', () => {
  const before = source;
  const words = metrics.map(metric => render(metric).match(/status-word">([^<]+)</)![1]);
  expect(words).toEqual(['draft (older value)', 'proposed', 'approved', 'deprecated', 'approved']);
  expect(source).toBe(before);
});

test('the metric with two workbench entries says the second is ignored', () => {
  expect(render(metrics[4])).toContain('second workbench entry');
  expect(render(metrics[2])).not.toContain('second workbench entry');
});

test('the metric form has no classification field', () => {
  expect(render(metrics[1])).not.toContain('Classification');
});

test('one status edit changes only the status bytes of that metric', () => {
  const plan = planMetricGovernance(source, 'semantic-model.yaml', ['metrics', 1], { status: 'approved' });
  if ('refusal' in plan) throw new Error(plan.refusal);
  expect(plan.source).toBe(source.replace('"owner": "Finance", "status": "proposed"', '"owner": "Finance", "status": "approved"'));
  expect(parse(plan.source).metrics[1].custom_extensions).toHaveLength(1);
});

test('deprecating with a reason writes both attributes', () => {
  const plan = planMetricGovernance(source, 'semantic-model.yaml', ['metrics', 2], { status: 'deprecated', deprecationReason: 'Replaced by revenue_net.' });
  if ('refusal' in plan) throw new Error(plan.refusal);
  const data = JSON.parse(parse(plan.source).metrics[2].custom_extensions[0].data);
  expect(data).toMatchObject({ status: 'deprecated', deprecation_reason: 'Replaced by revenue_net.' });
});
