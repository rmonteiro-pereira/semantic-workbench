import { expect, test } from 'bun:test';
import type { Entity } from '../../src/shared/core/model';
import { entityCardData, reservedNameHeight } from '../../src/app/graph/full-node-data';
import { LARGEST_ENTITY_NAME_PX } from '../../src/app/graph/overview-capacity';
import { cardNameFontSize } from '../../src/app/graph/text-fit';

const entity: Entity = { name: 'Customer', id: 'customer', fields: [], path: [], kind: 'Concept', description: '' };

test('unmarked graph cards preserve their original data and marks do not change outer dimensions', () => {
  const dimensions = { width: 220, height: 104 };
  const nameCap = cardNameFontSize(entity.name, { ...dimensions, reservedHeight: 0 }, LARGEST_ENTITY_NAME_PX);
  expect(JSON.stringify(entityCardData(entity, dimensions))).toBe(JSON.stringify({ nameCap: `${nameCap}px` }));
  const changed = { ...entity, change: 'changed' as const };
  expect(entityCardData(changed, dimensions)).toMatchObject({ change: 'changed' });
  expect(reservedNameHeight(changed)).toBeGreaterThan(reservedNameHeight(entity));
  expect(dimensions).toEqual({ width: 220, height: 104 });
});
