// The comparison uses the existing attribute rule instead of creating a second classification.
import { expect, test } from 'bun:test';
import { conceptKindLookup, isAttribute } from '../../src/shared/attributes/attribute-rule';

const lookup = conceptKindLookup([
  { concept: 'Tier', type: 'ValueType' },
  { concept: 'Order', type: 'EntityType' },
]);

test('one value-type or built-in role is an attribute', () => {
  expect(isAttribute({ roles: [{ concept: 'Tier' }] }, lookup)).toBe(true);
  expect(isAttribute({ roles: [{ concept: 'String' }] }, lookup)).toBe(true);
});

test('an entity target, two roles and no roles remain relationships', () => {
  expect(isAttribute({ roles: [{ concept: 'Order' }] }, lookup)).toBe(false);
  expect(isAttribute({ roles: [{ concept: 'Tier' }, { concept: 'String' }] }, lookup)).toBe(false);
  expect(isAttribute({}, lookup)).toBe(false);
});
