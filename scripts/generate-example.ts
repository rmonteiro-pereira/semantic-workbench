// Generates a deterministic scale example with 1,000 entities and 5,000 relationships.
import { stringify } from 'yaml';
const domains = [
  'Customer',
  'Order',
  'Product',
  'Invoice',
  'Shipment',
  'Payment',
  'Supplier',
  'Account',
  'Campaign',
  'Warehouse',
];
const offsets = [1, 3, 7, 19, 43];
const ontology = Array.from({ length: 1000 }, (_, i) => ({
  concept: `${domains[i % domains.length]}_${String(i).padStart(4, '0')}`,
  type: 'EntityType',
  description: `Business entity ${i} in the ${domains[i % domains.length].toLowerCase()} domain.`,
  relationships: offsets.map((offset, j) => {
    const target = (i + offset) % 1000;
    const to = `${domains[target % domains.length]}_${String(target).padStart(4, '0')}`;
    return {
      name: ['references', 'belongs_to', 'fulfills', 'supports', 'depends_on'][j],
      description: `Relationship from entity ${i} to entity ${target}.`,
      multiplicity: 'ManyToOne',
      roles: [{ concept: to }],
      verbalizes: [
        `{${domains[i % domains.length]}_${String(i).padStart(4, '0')}} references {${to}}`,
      ],
    };
  }),
}));
await Bun.write(
  'public/examples/enterprise-1000.ossie.yaml',
  stringify({
    name: 'Enterprise · 1,000 entities / 5,000 relationships',
    description: 'Synthetic, deterministic scale example. No real business data.',
    ontology,
  }),
);
