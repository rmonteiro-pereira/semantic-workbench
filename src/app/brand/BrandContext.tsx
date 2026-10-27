// Gives the interface the product identity from /brand/brand.json and keeps the document title
// in step with it. Until the file arrives, or if it cannot be read, a neutral name is shown.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { parseBrandManifest, type BrandManifest } from '../../shared/brand/manifest';

/** Where the brand bundle is served, in the built app and in the development server alike. */
export const BRAND_PATH = '/brand';

const NEUTRAL_BRAND: BrandManifest = { productName: 'Workbench', shortName: 'Workbench' };

const BrandContext = createContext<BrandManifest>(NEUTRAL_BRAND);

async function fetchManifest(): Promise<BrandManifest> {
  const response = await fetch(`${BRAND_PATH}/brand.json`);
  if (!response.ok) throw new Error(`brand.json answered ${response.status}`);
  return parseBrandManifest(await response.text());
}

/** Loads the brand once and supplies it to every component below. */
export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState(NEUTRAL_BRAND);
  useEffect(() => {
    let current = true;
    fetchManifest()
      .then(manifest => current && setBrand(manifest))
      .catch(error => console.warn('The brand could not be loaded:', error));
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    document.title = brand.productName;
  }, [brand.productName]);
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

/** The product name, short name and support link of this deployment. */
export function useBrand(): BrandManifest {
  return useContext(BrandContext);
}

/** Narrow screens show the compact mark; wider ones show the full logo. */
const NARROW_SCREEN = '(max-width: 480px)';

/** The full logo, replaced by the compact mark on a narrow screen. */
export function BrandLogo({ className }: { className?: string }) {
  const { productName } = useBrand();
  return (
    <picture>
      <source media={NARROW_SCREEN} srcSet={`${BRAND_PATH}/logo-mark.svg`} />
      <img className={className} src={`${BRAND_PATH}/logo.svg`} alt={productName} />
    </picture>
  );
}
