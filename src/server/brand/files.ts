// The files a brand folder may hold, their size limits and how each is served. Any other file
// in the folder is ignored, so the folder can never expose something it was not meant to.

/** Every file name a brand bundle accepts. */
export const BRAND_FILE_NAMES = [
  'logo.svg',
  'logo-mark.svg',
  'favicon.svg',
  'brand.json',
  'brand.css',
] as const;

/** One of the file names a brand bundle accepts. */
export type BrandFileName = (typeof BRAND_FILE_NAMES)[number];

/** Largest size of a logo or favicon, in bytes. */
export const MAX_IMAGE_BYTES = 256 * 1024;

/** Largest size of brand.json or brand.css, in bytes. */
export const MAX_TEXT_BYTES = 64 * 1024;

const CONTENT_TYPES: Record<BrandFileName, string> = {
  'logo.svg': 'image/svg+xml',
  'logo-mark.svg': 'image/svg+xml',
  'favicon.svg': 'image/svg+xml',
  'brand.json': 'application/json; charset=utf-8',
  'brand.css': 'text/css; charset=utf-8',
};

// Nothing in a brand file needs scripts, network access or framing. An SVG may carry its own
// inline style; the sandbox makes a file opened on its own an opaque, script-free document.
const IMAGE_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
const TEXT_POLICY = "default-src 'none'; sandbox";

/** True when the name is one of the accepted files. */
export function isBrandFileName(name: string): name is BrandFileName {
  return (BRAND_FILE_NAMES as readonly string[]).includes(name);
}

/** The largest size a file may have. */
export function maxBytesOf(name: BrandFileName): number {
  return name.endsWith('.svg') ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
}

/** The Content-Security-Policy the file is served with. */
export function contentSecurityPolicyOf(name: BrandFileName): string {
  return name.endsWith('.svg') ? IMAGE_POLICY : TEXT_POLICY;
}

/** The Content-Type the file is served with. */
export function contentTypeOf(name: BrandFileName): string {
  return CONTENT_TYPES[name];
}

/** Raised when a brand file cannot be used; the loader logs it and keeps the default. */
export class BrandFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandFileError';
  }
}
