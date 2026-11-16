/** Defines production viewport faults exercised through disposable predicate copies. */
export const lineageMutants: [string, string, string, string][] = [
  ['lineage-review', 'scripts/lineage-mutation-cases.ts', "const targetCompensation = 'Math.max(24, 24 / zoom)';", "const targetCompensation = '24';"],
  [
    'lineage-review',
    'scripts/lineage-mutation-cases.ts',
    "const reachDecision = '(right - left) * zoom + margin * 2 <= view.width && (bottom - top) * zoom + margin * 2 <= view.height';",
    "const reachDecision = 'true';",
  ],
];
