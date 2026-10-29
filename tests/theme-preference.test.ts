// The stored light or dark choice and how it reaches the page.
import { afterEach, expect, test } from 'bun:test';
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  parseThemePreference,
  readThemePreference,
  storeThemePreference,
} from '../src/theme/theme-preference';

const realStorage = globalThis.localStorage;

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: realStorage, configurable: true });
});

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  return items;
}

function blockedStorage() {
  const refuse = () => {
    throw new Error('storage is blocked');
  };
  const storage = { getItem: refuse, setItem: refuse, removeItem: refuse };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

test('only light and dark are choices; anything else follows the system', () => {
  expect(parseThemePreference('light')).toBe('light');
  expect(parseThemePreference('dark')).toBe('dark');
  for (const stored of [null, undefined, '', 'system', 'DARK', 'sepia']) {
    expect(parseThemePreference(stored)).toBe('system');
  }
});

test('a choice is stored and read back, and System clears it', () => {
  const items = fakeStorage();
  storeThemePreference('dark');
  expect(items.get(THEME_STORAGE_KEY)).toBe('dark');
  expect(readThemePreference()).toBe('dark');
  storeThemePreference('system');
  expect(items.has(THEME_STORAGE_KEY)).toBe(false);
  expect(readThemePreference()).toBe('system');
});

test('blocked storage never throws and leaves the system setting in charge', () => {
  blockedStorage();
  expect(readThemePreference()).toBe('system');
  expect(() => storeThemePreference('dark')).not.toThrow();
});

test('the page shows the choice as data-theme and System removes it', () => {
  const attributes = new Map<string, string>();
  const root = {
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  } as unknown as HTMLElement;
  applyThemePreference(root, 'dark');
  expect(attributes.get('data-theme')).toBe('dark');
  applyThemePreference(root, 'light');
  expect(attributes.get('data-theme')).toBe('light');
  applyThemePreference(root, 'system');
  expect(attributes.has('data-theme')).toBe(false);
});
