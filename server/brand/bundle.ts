// Loads the brand bundle once at start: the default files that ship with the product, with any
// file in the operator's brand folder laid over them. Every file is checked and cleaned here, so
// the rest of the server only ever sees content that is safe to serve. A file that fails is
// reported by name and the default stays in its place.
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BrandManifestError,
  parseBrandManifest,
  type BrandManifest,
} from '../../src/brand/manifest';
import {
  BRAND_FILE_NAMES,
  BrandFileError,
  contentTypeOf,
  isBrandFileName,
  maxBytesOf,
  type BrandFileName,
} from './files';
import { sanitizeBrandCss } from './sanitize-css';
import { sanitizeSvg } from './sanitize-svg';

/** One file of the bundle after checking, ready to be served. */
export type BrandFile = { body: string; contentType: string };

/** The files the server serves under /brand and the product identity read from brand.json. */
export type BrandBundle = {
  files: ReadonlyMap<BrandFileName, BrandFile>;
  manifest: BrandManifest;
};

/** Where the shipped defaults live; the image carries this folder next to server/. */
export const DEFAULT_BRAND_DIRECTORY = fileURLToPath(
  new URL('../../public/brand/', import.meta.url),
);

type Warn = (message: string) => void;

// Finds the file the name stands for inside the folder, following a symlink only when its target
// stays inside the folder, so a mounted volume cannot point the server at a file elsewhere.
function resolveInside(directory: string, name: BrandFileName): string | null {
  const path = join(directory, name);
  try {
    lstatSync(path);
  } catch {
    return null;
  }
  const real = realpathSync(path);
  if (!real.startsWith(realpathSync(directory) + sep)) {
    throw new BrandFileError('it points outside the brand folder.');
  }
  return real;
}

function readBrandText(directory: string, name: BrandFileName): string | null {
  try {
    const real = resolveInside(directory, name);
    if (real === null) return null;
    const status = lstatSync(real);
    if (!status.isFile()) throw new BrandFileError('it is not a regular file.');
    const limit = maxBytesOf(name);
    if (status.size > limit) throw new BrandFileError(`it is larger than ${limit / 1024} KiB.`);
    return readFileSync(real, 'utf8');
  } catch (error) {
    if (error instanceof BrandFileError) throw error;
    throw new BrandFileError(`it cannot be read (${(error as NodeJS.ErrnoException).code}).`);
  }
}

function checkContent(name: BrandFileName, text: string, warn: Warn): string {
  if (name === 'brand.json') {
    return JSON.stringify(parseBrandManifest(text), null, 2) + '\n';
  }
  if (name === 'brand.css') {
    const { css, dropped } = sanitizeBrandCss(text);
    for (const reason of dropped) warn(`brand.css: ${reason}`);
    return css;
  }
  return sanitizeSvg(text);
}

function loadFile(directory: string, name: BrandFileName, warn: Warn): BrandFile | null {
  try {
    const text = readBrandText(directory, name);
    if (text === null) return null;
    return { body: checkContent(name, text, warn), contentType: contentTypeOf(name) };
  } catch (error) {
    if (error instanceof BrandFileError || error instanceof BrandManifestError) {
      warn(`${name}: ${error.message} The default is used instead.`);
      return null;
    }
    throw error;
  }
}

function warnAboutUnknownFiles(directory: string, warn: Warn): void {
  for (const entry of readdirSync(directory)) {
    if (!isBrandFileName(entry)) warn(`${entry}: not a brand file, ignored.`);
  }
}

/**
 * Builds the bundle. Without a brand folder the defaults are used as they are. The defaults pass
 * the same checks as an operator's files, and a missing default brand.json stops the start.
 */
export function loadBrandBundle(
  options: { directory?: string | null; defaults?: string; warn?: Warn } = {},
): BrandBundle {
  const warn = options.warn ?? (message => console.warn(`[brand] ${message}`));
  const defaults = options.defaults ?? DEFAULT_BRAND_DIRECTORY;
  const files = new Map<BrandFileName, BrandFile>();
  if (options.directory) warnAboutUnknownFiles(options.directory, warn);
  for (const name of BRAND_FILE_NAMES) {
    const custom = options.directory ? loadFile(options.directory, name, warn) : null;
    const file = custom ?? loadFile(defaults, name, message => warn(`default ${message}`));
    if (file) files.set(name, file);
  }
  const manifestFile = files.get('brand.json');
  if (!manifestFile) throw new Error('The default brand.json is missing.');
  return { files, manifest: parseBrandManifest(manifestFile.body) };
}
