// Exercises metric status through the existing query composer without changing consumer definitions.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryComposer } from '../../src/app/mappings/QueryComposer';
import type { RuntimeContext } from '../../src/server/agent/runtime';

const noop = () => {};
function render(status?: string): string {
  const definition = {
    name: 'revenue',
    expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'SUM(orders.amount)' }] },
    custom_extensions: [{ vendor_name: 'SEMANTIC_WORKBENCH', data: JSON.stringify({ schema: 'semantic-workbench/metric/v1', ...(status ? { status } : {}) }) }],
  };
  const metric: RuntimeContext['metrics'][number] = {
    id: 'revenue',
    name: 'Revenue',
    definition,
    fields: [],
    datasets: [],
    dependsOn: [],
    evidence: { documentId: 'finance/model.yaml', filename: 'model.yaml', revision: 1, path: ['metrics', 0] },
  };
  return renderToStaticMarkup(
    <QueryComposer
      governed={[metric]}
      fields={[]}
      metrics={[]}
      dimensions={[]}
      onToggleMetric={noop}
      onToggleDimension={noop}
      canPreview={false}
      loading={false}
      plan={null}
      error=""
      onPreview={noop}
      onClose={noop}
    />,
  );
}

test('approved metrics keep their existing label without a warning', () => {
  const html = render('approved');
  expect(html).toContain('Revenue');
  expect(html).not.toContain('Not approved');
  expect(html).not.toContain('Status not set');
});

test('proposed, legacy draft and deprecated metrics show their status in words', () => {
  for (const status of ['proposed', 'draft', 'deprecated']) expect(render(status)).toContain(`Not approved: ${status}`);
});

test('an absent status is never treated as approved', () => {
  expect(render()).toContain('Status not set');
});
