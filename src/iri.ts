// Ossie global identifiers: a full IRI, or a prefix:local QName expanded through the
// ontology-level `prefixes` map (ontology.md, "Global identifiers"). Nothing is fetched.
export type Prefixes = Record<string, string>;
export type Namespace = { prefix?: string; iri: string };
const QNAME = /^([A-Za-z_][\w.-]*)?:(.*)$/s;
const SCHEME = /^[a-z][a-z\d+.-]*$/i;
// Schemes whose IRIs are absolute without an authority ("//"), so they are not mistaken for undeclared prefixes.
const OPAQUE = new Set([
  'urn',
  'mailto',
  'tag',
  'info',
  'data',
  'did',
  'doi',
  'uuid',
  'isbn',
  'tel',
  'geo',
  'file',
]);
export const prefixMap = (value: unknown): Prefixes =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string'),
      )
    : {};
export function expandIri(
  value: string,
  prefixes: Prefixes = {},
): { iri: string; prefix?: string } | { error: string } {
  const m = QNAME.exec(value);
  if (!m) return { error: 'Expected a full IRI or a prefix:local QName.' };
  const prefix = m[1] ?? '';
  const local = m[2];
  if (Object.hasOwn(prefixes, prefix)) return { iri: prefixes[prefix] + local, prefix };
  if (SCHEME.test(prefix) && (local.startsWith('//') || OPAQUE.has(prefix.toLowerCase())))
    return { iri: value };
  return {
    error: `Prefix "${prefix}" is not declared in prefixes. Declare it at the top level or use a full IRI.`,
  };
}
/** Longest declared namespace containing the IRI; otherwise the IRI up to its last '#' or '/'. */
export function namespaceOf(iri: string, prefixes: Prefixes = {}): Namespace | undefined {
  let best: Namespace | undefined;
  for (const [prefix, base] of Object.entries(prefixes))
    if (
      base &&
      iri.startsWith(base) &&
      iri.length > base.length &&
      (!best || base.length > best.iri.length)
    )
      best = { prefix, iri: base };
  if (best) return best;
  const cut = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
  return cut > 0 && cut < iri.length - 1 && /^[a-z][a-z\d+.-]*:/i.test(iri)
    ? { iri: iri.slice(0, cut + 1) }
    : undefined;
}
