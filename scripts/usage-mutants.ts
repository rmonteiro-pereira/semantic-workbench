// Deliberate faults in the usage counters: each must make a case of usage-mutation-cases.ts fail.
/** Mutants use the same category, module, before and after tuple as the suite. */
export const usageMutants: [string, string, string, string][] = [
  ['usage-recorder', 'src/server/usage/usage-recorder.ts', 'if (input.status < 200 || input.status >= 300) return undefined;', ''],
  ['usage-recorder', 'src/server/usage/usage-recorder.ts', "if (input.surface === 'browser') return undefined;", ''],
  ['usage-recorder', 'src/server/usage/usage-recorder.ts', 'if (!rule || !commit || length > MAX_COUNTED_RESPONSE_BYTES) return;', 'if (!rule || length > MAX_COUNTED_RESPONSE_BYTES) return;'],
  ['usage-recorder', 'src/server/usage/usage-recorder.ts', 'if (!deps.settings.enabled) return NO_USAGE_RECORDER;', ''],
  [
    'usage-recorder',
    'src/server/usage/usage-recorder.ts',
    'increment(project, rule, input, itemAddresses(rule.items, { answer, models, target: input.target }));',
    'const found = itemAddresses(rule.items, { answer, models, target: input.target });\n    increment(project, rule, input, [...found, ...found]);',
  ],
  ['usage-items', 'src/server/usage/usage-items.ts', 'return [...texts].sort().slice(0, MAX_ITEMS_PER_REQUEST);', 'return [...texts, ...texts].sort().slice(0, MAX_ITEMS_PER_REQUEST);'],
  [
    'usage-flush',
    'src/server/usage/usage-flush.ts',
    "return { action: 'write', file: { ...merged, migratedThrough: latest } };",
    "return { action: 'write', file: { ...merged, migratedThrough: latest, connection: 'connection-1' } };",
  ],
  ['usage-read', 'src/server/usage/usage-read.ts', 'if (document === null || !input.canRead(document) || total === 0) continue;', 'if (document === null || total === 0) continue;'],
  ['usage-migration', 'src/server/usage/usage-migration.ts', 'const target = currentAddress(address, pending);', 'const target = address;'],
  ['usage-migration', 'src/server/usage/usage-migration.ts', 'if (deletesAddress(record, address)) return null;', ''],
  ['usage-retention', 'src/server/usage/usage-retention.ts', 'return days.filter(day => isDay(day) && day < oldestKept);', 'return days.filter(day => isDay(day) && day < oldestKept && false);'],
];
