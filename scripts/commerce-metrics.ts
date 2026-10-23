// Governed metrics of the commerce example, with owner, status and the concepts they measure. The
// generator writes them into the semantic model and a metrics-only mapping.
import type { GovernedMetric } from './helpers/example-metrics';

const orderDate = {
  dimension: 'orders.order_date',
  min_grain: 'day',
  allowed_grains: ['day', 'week', 'month', 'quarter', 'year'],
} as const;
// An order reaches its customer in one join; an order line reaches the customer in two.
const orderDimensions = ['customers.name', 'orders.status'];
const lineDimensions = ['products.name', 'customers.name', 'orders.status'];

/** The metrics shipped with the commerce example, in the order they are listed. */
export const governedMetrics: GovernedMetric[] = [
  {
    name: 'gross_revenue',
    datatype: 'Decimal',
    description:
      'Order amount before refunds. Aggregate orders only to avoid multiplying totals by lines.',
    expression: 'SUM(orders.amount)',
    extension: {
      label: 'Gross revenue',
      type: 'simple',
      additivity: 'additive',
      unit: 'USD',
      format: '#,##0.00',
      owner: 'Finance',
      status: 'approved',
      time: orderDate,
      dimensions: orderDimensions,
    },
    binding: { measures: 'Order', of: 'Customer' },
  },
  {
    name: 'order_count',
    datatype: 'Integer',
    expression: 'COUNT(DISTINCT orders.order_id)',
    extension: {
      label: 'Order count',
      type: 'simple',
      additivity: 'non_additive',
      unit: 'orders',
      format: '#,##0',
      owner: 'Sales Operations',
      status: 'approved',
      time: orderDate,
      dimensions: orderDimensions,
    },
    binding: { measures: 'Order', of: 'Customer' },
  },
  {
    name: 'average_order_value',
    datatype: 'Decimal',
    expression: 'gross_revenue / NULLIF(order_count, 0)',
    extension: {
      label: 'Average order value',
      type: 'ratio',
      numerator: 'gross_revenue',
      denominator: 'order_count',
      additivity: 'non_additive',
      unit: 'USD',
      format: '#,##0.00',
      owner: 'Finance',
      status: 'approved',
      time: orderDate,
      dimensions: orderDimensions,
      targets: [{ grain: 'month', direction: 'higher_is_better', value: 120 }],
    },
    binding: { measures: 'Order', of: 'Customer' },
  },
  {
    name: 'units_sold',
    datatype: 'Integer',
    description:
      'Product units on order lines. Cancelled orders are included; filter by order status to exclude them.',
    expression: 'SUM(order_lines.quantity)',
    extension: {
      label: 'Units sold',
      type: 'simple',
      additivity: 'additive',
      unit: 'units',
      format: '#,##0',
      owner: 'Merchandising',
      status: 'approved',
      time: orderDate,
      dimensions: lineDimensions,
    },
    binding: { measures: 'OrderLine', of: 'Product' },
  },
  {
    name: 'line_revenue',
    datatype: 'Decimal',
    description: 'Revenue of order lines. Aggregate lines, not orders, when slicing by product.',
    expression: 'SUM(order_lines.line_amount)',
    extension: {
      label: 'Line revenue',
      type: 'simple',
      additivity: 'additive',
      unit: 'USD',
      format: '#,##0.00',
      owner: 'Merchandising',
      status: 'approved',
      time: orderDate,
      dimensions: lineDimensions,
    },
    binding: { measures: 'OrderLine', of: 'Product' },
  },
  {
    name: 'revenue_per_unit',
    datatype: 'Decimal',
    description: 'Line revenue divided by units sold.',
    expression: 'line_revenue / NULLIF(units_sold, 0)',
    extension: {
      label: 'Revenue per unit',
      type: 'ratio',
      numerator: 'line_revenue',
      denominator: 'units_sold',
      additivity: 'non_additive',
      unit: 'USD',
      format: '#,##0.00',
      owner: 'Merchandising',
      status: 'proposed',
      time: orderDate,
      dimensions: ['products.name', 'customers.name'],
    },
    binding: { measures: 'OrderLine', of: 'Product' },
  },
];
