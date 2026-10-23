// The commerce semantic model as it shipped before its metrics were governed: three metrics with
// no workbench attributes, the average order value written out as one expression. Browser checks
// use it where they need a metric without attributes or the earlier shape of the lineage canvas.
import { parseDocument } from 'yaml';

const PLAIN_METRICS = ['gross_revenue', 'order_count', 'average_order_value'];
const AVERAGE_ORDER_VALUE = 'SUM(orders.amount) / NULLIF(COUNT(DISTINCT orders.order_id), 0)';

/** Returns the commerce semantic model with its three original metrics as they were written. */
export async function plainCommerceModel(): Promise<string> {
  const model = parseDocument(await Bun.file('public/examples/commerce/sales.ossie.yaml').text());
  const plainMetrics = model
    .toJS()
    .metrics.filter((metric: { name: string }) => PLAIN_METRICS.includes(metric.name))
    .map(({ custom_extensions: _attributes, ...metric }: Record<string, any>) =>
      metric.name === 'average_order_value'
        ? {
            ...metric,
            expression: { dialects: [{ dialect: 'ANSI_SQL', expression: AVERAGE_ORDER_VALUE }] },
          }
        : metric,
    );
  model.set('metrics', model.createNode(plainMetrics));
  return model.toString({ lineWidth: 0 });
}
