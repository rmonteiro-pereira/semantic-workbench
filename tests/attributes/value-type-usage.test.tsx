// Checks a value type lists the attributes that use it across the document, with links to their concepts.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'yaml';
import { ValueTypeUsage, attributesUsing } from '../../src/app/attributes/ValueTypeUsage';
import { ADDITIONS_PROJECT_FILES } from '../helpers/tessera-repository';

const concepts = parse(ADDITIONS_PROJECT_FILES['retail/ontology.yaml']).ontology;

test('the attributes that hold a value type are found across concepts', () => {
  expect(attributesUsing('LoyaltyTier', concepts)).toEqual([{ concept: 'Customer', attribute: 'tier' }]);
  expect(attributesUsing('String', concepts)).toEqual([{ concept: 'Customer', attribute: 'email' }]);
  expect(attributesUsing('Money', concepts)).toEqual([]);
});

test('the list links to each concept and an unused type says so', () => {
  const used = renderToStaticMarkup(<ValueTypeUsage valueTypeName="LoyaltyTier" concepts={concepts} onOpenConcept={() => {}} />);
  expect(used).toContain('tier');
  expect(used).toContain('<button type="button" class="link">Customer</button>');
  const unused = renderToStaticMarkup(<ValueTypeUsage valueTypeName="Money" concepts={concepts} />);
  expect(unused).toContain('No attribute uses Money yet.');
});

test('an inherited attribute is listed once, under the concept that declares it', () => {
  const inherited = [...concepts, { concept: 'VipCustomer', type: 'EntityType', extends: ['Customer'] }];
  expect(attributesUsing('LoyaltyTier', inherited)).toEqual([{ concept: 'Customer', attribute: 'tier' }]);
});
