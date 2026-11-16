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
  ['address-model', 'src/shared/core/model-addresses.ts', 'if (!wanted || wanted.kind !== kind) return false;', 'if (!wanted) return false;'],
  [
    'address-model',
    'src/shared/core/model-addresses.ts',
    "if (matches.length > 1) return { status: 'ambiguous', items: matches.map(item => ({ ...item, ambiguous: true })) };",
    "if (matches.length > 1) return { status: 'found', item: matches[0] };",
  ],
  ['address-model', 'src/shared/core/model-addresses.ts', "chain.some(segment => 'position' in segment)", 'false'],
];

/** Faults in migration ordering, stable replay and request ownership. */
export const migrationAddressMutants: [string, string, string, string][] = [
  ['address-migration', 'src/shared/core/address-migration.ts', 'for (const record of records)', 'for (const record of [...records].reverse())'],
  ['address-migration', 'src/shared/core/address-migration.ts', 'if (applied.has(record.id)) continue;', ''],
  ['address-migration', 'src/shared/core/address-migration.ts', 'if (resolved) return address;', ''],
  [
    'address-migration',
    'src/shared/core/address-migration.ts',
    'if (to) current = replacePrefix(current, from, to);',
    'if (to && itemAddress.formatAddress(current).startsWith(record.from)) current = { ...current, ...to, chain: [...to.chain, ...current.chain.slice(from.chain.length)], snapshot: current.snapshot };',
  ],
  ['address-migration', 'src/shared/core/address-migration.ts', 'from.project !== project || to.project !== project', 'false'],
];

/** Faults in hidden-equals-missing, read ordering, durable replay and locator logging. */
export const serverAddressMutants: [string, string, string, string][] = [
  [
    'address-server',
    'src/server/projects/address-resolution.ts',
    "!readable(parsed.address, reader)) return { status: 'missing' };",
    "!readable(parsed.address, reader)) return { status: 'forbidden' } as any;",
  ],
  [
    'address-server',
    'src/server/projects/address-resolution.ts',
    'const parsed = parseAddress(text);',
    'const parsed = parseAddress(text);\n  if (parsed.ok && parsed.address.project) context.projectExists(parsed.address.project);',
  ],
  ['address-store', 'src/server/projects/address-migrations.ts', '      continue;\n    }\n    records.push(record);', '    }\n    records.push(record);'],
  ['address-server', 'src/server/projects/address-resolution.ts', 'const parsed = parseAddress(text);', "const parsed = parseAddress(text);\n  console.log('address.resolve', { address: text });"],
];

/** Faults in the scoped, typed request predicates of address operation routes. */
export const addressOperationMutants: [string, string, string, string][] = [
  ['address-operation', 'src/server/routes/item-addresses.ts', 'parsed.address.project !== project || ', ''],
  ['address-operation', 'src/server/routes/item-addresses.ts', ' || !parsed.address.chain.length', ''],
  ['address-operation', 'src/server/routes/item-addresses.ts', "Object.keys(body).some(key => key !== 'address')", 'false'],
  ['address-operation', 'src/server/routes/item-addresses.ts', "Object.keys(body).some(key => !['operationId', 'from', 'to'].includes(key))", 'false'],
  ['address-operation', 'src/server/routes/item-addresses.ts', "typeof body.operationId !== 'string'", 'false'],
  ['address-operation', 'src/server/routes/item-addresses.ts', 'readJson(request, ITEM_ADDRESS_REQUEST_LIMIT)', 'readJson(request, ITEM_ADDRESS_REQUEST_LIMIT * 2)'],
];
