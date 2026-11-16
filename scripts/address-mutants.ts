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

/** Faults in model matching and positional stability. */
export const modelAddressMutants: [string, string, string, string][] = [
  [
    'address-model',
    'src/shared/core/model-addresses.ts',
    'if (!wanted || wanted.kind !== kind || JSON.stringify(wanted) !== JSON.stringify(segment)) return;',
    "if (!wanted || ('name' in wanted ? wanted.name : wanted.position) !== ('name' in segment ? segment.name : segment.position)) return;",
  ],
  [
    'address-model',
    'src/shared/core/model-addresses.ts',
    "if (matches.length > 1) return { status: 'ambiguous', items: matches.map(item => ({ ...item, ambiguous: true })) };",
    "if (matches.length > 1) return { status: 'found', item: matches[0] };",
  ],
  ['address-model', 'src/shared/core/model-addresses.ts', "chain.some(segment => 'position' in segment)", 'false'],
];
