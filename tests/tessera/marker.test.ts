// Checks the marker is read only at the top level and only when it is a whole number of at least one.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { readMarker } from '../../src/shared/tessera/marker';

test('a whole number of at least one is a revision', () => {
  expect(readMarker({ tessera: 1 })).toEqual({ family: 'tessera', revision: 1 });
  expect(readMarker({ tessera: 7 })).toEqual({ family: 'tessera', revision: 7 });
});

for (const [label, value, reason] of [
  ['the string "1"', '1', 'not-a-whole-number'],
  ['zero', 0, 'below-one'],
  ['minus one', -1, 'below-one'],
  ['1.5', 1.5, 'not-a-whole-number'],
  ['true', true, 'not-a-whole-number'],
  ['null', null, 'not-a-whole-number'],
] as const) {
  test(`${label} is an invalid marker`, () => {
    expect(readMarker({ tessera: value })).toEqual({ family: 'invalid', reason, value });
  });
}

test('1.0 written in YAML is the whole number 1', () => {
  expect(readMarker(parse('tessera: 1.0'))).toEqual({ family: 'tessera', revision: 1 });
});

test('a tessera key below the top level is ordinary data', () => {
  expect(readMarker({ ontology: [{ concept: 'Order', tessera: 1 }] })).toEqual({ family: 'standard' });
});

test('a tessera key inside a vendor extension payload is ordinary data', () => {
  const payload = { datasets: [], custom_extensions: [{ vendor_name: 'SEMANTIC_WORKBENCH', data: { tessera: 1 } }] };
  expect(readMarker(payload)).toEqual({ family: 'standard' });
});

test('an array, a scalar and nothing at all are standard', () => {
  expect(readMarker([{ tessera: 1 }])).toEqual({ family: 'standard' });
  expect(readMarker('tessera')).toEqual({ family: 'standard' });
  expect(readMarker(undefined)).toEqual({ family: 'standard' });
});
