import { useCallback, useSyncExternalStore } from 'react';
import { ADMIN_SECTIONS, DEFAULT_ADMIN_SECTION, type AdminSectionId } from './admin-sections';

const ADMIN_HASH_PREFIX = '#/admin';

/** Reads the Admin section a URL hash names, or null when the hash leaves the Admin page. */
export function parseAdminHash(hash: string): AdminSectionId | null {
  if (hash !== ADMIN_HASH_PREFIX && !hash.startsWith(ADMIN_HASH_PREFIX + '/')) return null;
  const name = hash.slice(ADMIN_HASH_PREFIX.length + 1);
  const known = ADMIN_SECTIONS.find(section => section.id === name);
  return known?.id ?? DEFAULT_ADMIN_SECTION;
}

/** Builds the URL hash that opens an Admin section. */
export function adminHash(section: AdminSectionId): string {
  return `${ADMIN_HASH_PREFIX}/${section}`;
}

function subscribeToHash(notify: () => void): () => void {
  globalThis.addEventListener('hashchange', notify);
  return () => globalThis.removeEventListener('hashchange', notify);
}

function currentHash(): string {
  return globalThis.location.hash;
}

/**
 * Follows the Admin page through the URL hash, so Back, Forward and reload land on the same
 * section. Each change adds a history entry.
 */
export function useAdminRoute() {
  const hash = useSyncExternalStore(subscribeToHash, currentHash, () => '');
  const open = useCallback((section: AdminSectionId = DEFAULT_ADMIN_SECTION) => {
    globalThis.location.hash = adminHash(section);
  }, []);
  const close = useCallback(() => {
    globalThis.location.hash = '';
  }, []);
  return { section: parseAdminHash(hash), open, close };
}
