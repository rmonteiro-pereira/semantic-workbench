/** Deliberate faults in canonical spelling, bounds and segment matching. */
const grammar = 'src/shared/core/item-address.ts';

/** Registers the grammar predicates exercised by the portable address cases. */
export const addressMutants: [string, string, string, string][] = [
  ['address-grammar', grammar, "/[!'()*]/g", "/[!'()]/g"],
  ['address-grammar', grammar, "const snapshotStart = text.indexOf('@');", "text = text.replace(/%[0-9a-f]{2}/gi, escape => escape.toUpperCase());\n    const snapshotStart = text.indexOf('@');"],
  ['address-grammar', grammar, "if (text.length > 4096) return { ok: false, reason: 'length' };", ''],
  ['address-grammar', grammar, 'address.chain.length > 32', 'address.chain.length >= 32'],
  ['address-grammar', grammar, 'formatSegment(segment) === formatSegment(address.chain[index])', 'formatSegment(address.chain[index]).startsWith(formatSegment(segment))'],
  ['address-grammar', grammar, '/^(?:0|[1-9][0-9]*)$/', '/^[0-9]+$/'],
];
