// The product logo of the active brand, as an image so a deployment can swap the file alone.
import { BRAND_PATH, useBrand } from './BrandContext';

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
