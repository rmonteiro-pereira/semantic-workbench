/** Parses and formats canonical locators without filesystem or caller state. */
import { addressKinds, type ItemKind } from './address-kinds';

/** Locates a named or positional child in a model. */
export type ItemSegment = { kind: ItemKind; name: string } | { kind: ItemKind; position: number };
/** Represents an absolute or relative locator with an optional opaque snapshot token. */
export type Address = {
  grammar: 1;
  form: 'absolute' | 'project-relative' | 'document-relative';
  project?: string;
  document?: string[];
  chain: ItemSegment[];
  snapshot?: string;
};
/** Gives the closed set of canonical grammar failures. */
export type AddressFailure = 'prefix' | 'length' | 'depth' | 'empty' | 'escape' | 'encoding' | 'kind' | 'position' | 'form' | 'snapshot' | 'trailing';
/** Returns parsed data or a bounded grammar failure. */
export type AddressResult = { ok: true; address: Address } | { ok: false; reason: AddressFailure };

class AddressError extends Error {
  constructor(readonly reason: AddressFailure) {
    super(`Invalid item address: ${reason}`);
  }
}

function refuse(reason: AddressFailure): never {
  throw new AddressError(reason);
}

function encode(value: string): string {
  if (typeof value !== 'string') refuse('encoding');
  if (!value) refuse('empty');
  try {
    return encodeURIComponent(value).replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
  } catch {
    return refuse('encoding');
  }
}

function decode(value: string): string {
  if (!value) refuse('empty');
  if (!/^(?:[A-Za-z0-9._~-]|%[0-9A-F]{2})+$/.test(value)) refuse('escape');
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return refuse('encoding');
  }
  if (encode(decoded) !== value) refuse('escape');
  return decoded;
}

function formatSegment(segment: ItemSegment): string {
  if (!Object.hasOwn(addressKinds, segment.kind)) refuse('kind');
  if ('name' in segment) return `${segment.kind}:${encode(segment.name)}`;
  if (!Number.isSafeInteger(segment.position) || segment.position < 0) refuse('position');
  return `${segment.kind}:#${segment.position}`;
}

function formatLocation(address: Address): string {
  if (address.grammar !== 1) refuse('prefix');
  if (address.form === 'document-relative') {
    if (address.project !== undefined || address.document !== undefined || !address.chain.length) refuse('form');
    return '';
  }
  let location = '';
  if (address.form === 'absolute') {
    location = encode(address.project ?? '');
  } else if (address.form !== 'project-relative' || address.project !== undefined) {
    refuse('form');
  }
  if (address.document !== undefined) {
    if (!address.document.length) refuse('empty');
    const parts = address.document.map(part => {
      if (part === '.' || part === '..') refuse('form');
      return encode(part);
    });
    location += '/' + parts.join('/');
  } else if (address.form === 'project-relative' || address.chain.length) {
    refuse('form');
  }
  return location;
}

/** Produces the unique sw1 spelling and rejects invalid structures. */
export function formatAddress(address: Address): string {
  if (address.chain.length > 32) refuse('depth');
  const location = formatLocation(address);
  let text = 'sw1:' + location;
  if (address.chain.length) text += '#' + address.chain.map(formatSegment).join('/');
  if (address.snapshot !== undefined) {
    if (address.form !== 'absolute' || !/^[A-Za-z0-9._-]+$/.test(address.snapshot)) refuse('snapshot');
    text += '@' + address.snapshot;
  }
  if (text.length > 4096) refuse('length');
  return text;
}

function parseSegment(text: string): ItemSegment {
  const colon = text.indexOf(':');
  const kind = text.slice(0, colon) as ItemKind;
  if (colon < 0 || !Object.hasOwn(addressKinds, kind)) refuse('kind');
  const value = text.slice(colon + 1);
  if (!value.startsWith('#')) return { kind, name: decode(value) };
  const position = value.slice(1);
  if (!/^(?:0|[1-9][0-9]*)$/.test(position) || !Number.isSafeInteger(Number(position))) refuse('position');
  return { kind, position: Number(position) };
}

function parseLocation(location: string, chain: ItemSegment[]): Address {
  if (!location) return { grammar: 1, form: 'document-relative', chain };
  const parts = location.split('/');
  const project = parts.shift()!;
  const address: Address = { grammar: 1, form: 'project-relative', chain };
  if (project) {
    address.form = 'absolute';
    address.project = decode(project);
  }
  if (parts.length) address.document = parts.map(decode);
  return address;
}

/** Parses canonical text with a length guard before any proportional work. */
export function parseAddress(text: string): AddressResult {
  if (text.length > 4096) return { ok: false, reason: 'length' };
  if (!text.startsWith('sw1:')) return { ok: false, reason: 'prefix' };
  try {
    const snapshotStart = text.indexOf('@');
    const body = snapshotStart < 0 ? text.slice(4) : text.slice(4, snapshotStart);
    if (body.endsWith('/')) refuse('trailing');
    const chainStart = body.indexOf('#');
    const location = chainStart < 0 ? body : body.slice(0, chainStart);
    const segments = chainStart < 0 ? [] : body.slice(chainStart + 1).split('/');
    if (segments.length > 32) refuse('depth');
    const address = parseLocation(location, segments.map(parseSegment));
    if (snapshotStart >= 0) address.snapshot = text.slice(snapshotStart + 1);
    if (formatAddress(address) !== text) refuse('form');
    return { ok: true, address };
  } catch (error) {
    if (error instanceof AddressError) return { ok: false, reason: error.reason };
    throw error;
  }
}

/** Resolves a relative locator using only the supplied absolute base. */
export function resolveAddress(address: Address, base?: Address): AddressResult {
  if (address.form === 'absolute') return { ok: true, address };
  if (!base || base.form !== 'absolute') return { ok: false, reason: 'form' };
  if (address.form === 'document-relative' && !base.document) return { ok: false, reason: 'form' };
  const resolved: Address = { ...address, form: 'absolute', project: base.project };
  if (address.form === 'document-relative') resolved.document = base.document;
  return parseAddress(formatAddress(resolved));
}

/** Matches complete path and item segments rather than textual name prefixes. */
export function hasPrefix(address: Address, prefix: Address): boolean {
  if (address.form !== prefix.form || address.project !== prefix.project) return false;
  const path = address.document ?? [];
  const parentPath = prefix.document ?? [];
  if (parentPath.length && (path.length !== parentPath.length || path.some((part, index) => part !== parentPath[index]))) return false;
  if (prefix.chain.length > address.chain.length) return false;
  return prefix.chain.every((segment, index) => formatSegment(segment) === formatSegment(address.chain[index]));
}

/** Replaces a matched locator prefix while keeping descendants and the snapshot. */
export function replacePrefix(address: Address, from: Address, to: Address): Address {
  if (!hasPrefix(address, from)) return address;
  const result = { ...to, chain: [...to.chain, ...address.chain.slice(from.chain.length)] };
  if (!from.document) result.document = address.document;
  if (address.snapshot !== undefined) result.snapshot = address.snapshot;
  formatAddress(result);
  return result;
}

/** Returns an unescaped label for people, never a stored locator. */
export function displayName(address: Address): string {
  const last = address.chain.at(-1);
  if (last) return 'name' in last ? last.name : `#${last.position}`;
  return address.document?.at(-1) ?? address.project ?? '';
}
