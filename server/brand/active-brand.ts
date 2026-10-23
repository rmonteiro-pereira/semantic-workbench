// The bundle this server instance serves. Start-up sets it once from SW_BRAND_DIR, and the
// sign-in pages and the /brand route read it. It is held here instead of passed as a parameter
// because the pages are rendered from many error paths (route table, sign-in failures, the
// error mapper) that would each need the bundle threaded through. Reading it before it is set is
// a programming error and throws; there is no silent fallback to the files on disk.
import type { BrandBundle } from './bundle';

let active: BrandBundle | undefined;

/** Makes the bundle the one the server serves. */
export function setActiveBrand(bundle: BrandBundle): void {
  active = bundle;
}

/** The bundle in use; throws when start-up has not set one. */
export function activeBrand(): BrandBundle {
  if (!active) throw new Error('The brand bundle has not been loaded.');
  return active;
}

/** Forgets the chosen bundle, for tests that swap brands. */
export function resetActiveBrand(): void {
  active = undefined;
}
