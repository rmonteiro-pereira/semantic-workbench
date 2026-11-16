/** Verifies canvas preference conversion through its storage boundary. */
import { expect, test } from 'bun:test';
import { saveCenterPreference } from '../src/app/graph/center-preference';

function storage() {
  const entries = new Map<string, string>();
  return { entries, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => void entries.set(key, value), removeItem: (key: string) => void entries.delete(key) };
}

test('a stable center retains its exact prior value once and repeated conversion is harmless', () => {
  const store = storage();
  store.setItem('center', 'concept:A');
  const address = 'sw1:p/a.yaml#ontology:O/concept:A';
  expect(saveCenterPreference(store, 'center', address)).toBe(true);
  expect(store.getItem('center')).toBe(address);
  expect(store.getItem('center:before-item-addresses')).toBe('concept:A');
  expect(saveCenterPreference(store, 'center', address)).toBe(true);
  expect(saveCenterPreference(store, 'center', address.replace('concept:A', 'concept:B'))).toBe(true);
  expect(store.getItem('center:before-item-addresses')).toBe('concept:A');
});

test('an unverifiable backup leaves the original preference untouched', () => {
  const store = storage();
  store.setItem('center', 'concept:A');
  const faulty = { ...store, setItem: (key: string, value: string) => store.setItem(key, key.endsWith(':before-item-addresses') ? 'corrupt' : value) };
  expect(() => saveCenterPreference(faulty, 'center', 'sw1:p/a.yaml#ontology:O/concept:A')).toThrow('backup could not be verified');
  expect(store.getItem('center')).toBe('concept:A');
});

test('volatile and unaddressable centers never replace an existing preference', () => {
  const store = storage();
  store.setItem('center', 'old');
  expect(saveCenterPreference(store, 'center', 'sw1:p/a.yaml#ontology:#0/concept:A')).toBe(false);
  expect(saveCenterPreference(store, 'center', 'builtin:String')).toBe(false);
  expect(store.getItem('center')).toBe('old');
  expect(store.entries.size).toBe(1);
});
