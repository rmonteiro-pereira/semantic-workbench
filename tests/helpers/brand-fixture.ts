// Gives a test the shipped brand bundle, the way server start-up does.
import { loadBrandBundle, setActiveBrand } from '../../src/server/brand/bundle';

/** Makes the shipped defaults the active brand. */
export function useDefaultBrand(): void {
  setActiveBrand(loadBrandBundle());
}
