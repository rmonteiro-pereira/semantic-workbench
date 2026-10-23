// The product identity a deployment can replace: its name, a short name and a support link.
// The server validates brand.json with this reader before serving it, and the browser reads the
// same file through it, so both sides agree on what a valid manifest is.
import { hasControlCharacter } from '../control-characters';

/**
 * The text of brand.json once it has been checked. `shortName` is reserved for narrow headers and
 * is not shown yet; `supportUrl` is optional and reserved for a link to the deployment's support
 * page. Both are carried so a deployment can set them once.
 */
export type BrandManifest = {
  productName: string;
  shortName: string;
  supportUrl?: string;
};

/** Longest product name, short name and support link a manifest may hold. */
export const MANIFEST_LIMITS = { productName: 60, shortName: 24, supportUrl: 2048 };

/** Raised when brand.json is not a valid manifest; the message names what is wrong. */
export class BrandManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandManifestError';
  }
}

function readName(value: unknown, field: 'productName' | 'shortName'): string {
  const limit = MANIFEST_LIMITS[field];
  if (typeof value !== 'string') throw new BrandManifestError(`${field} must be text.`);
  const name = value.trim();
  if (!name || name.length > limit) {
    throw new BrandManifestError(`${field} must be 1 to ${limit} characters.`);
  }
  if (hasControlCharacter(name)) {
    throw new BrandManifestError(`${field} must not contain control characters.`);
  }
  return name;
}

function readSupportUrl(value: unknown): string {
  const message = 'supportUrl must be an http or https address.';
  if (typeof value !== 'string' || value.length > MANIFEST_LIMITS.supportUrl) {
    throw new BrandManifestError(message);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BrandManifestError(message);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BrandManifestError(message);
  return url.href;
}

/** Checks the parsed JSON of brand.json; unknown keys are dropped. */
export function readBrandManifest(value: unknown): BrandManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BrandManifestError('brand.json must hold a JSON object.');
  }
  const fields = value as Record<string, unknown>;
  const manifest: BrandManifest = {
    productName: readName(fields.productName, 'productName'),
    shortName: readName(fields.shortName, 'shortName'),
  };
  if (fields.supportUrl !== undefined) manifest.supportUrl = readSupportUrl(fields.supportUrl);
  return manifest;
}

/** Parses and checks the text of brand.json. */
export function parseBrandManifest(text: string): BrandManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BrandManifestError('brand.json is not valid JSON.');
  }
  return readBrandManifest(value);
}
