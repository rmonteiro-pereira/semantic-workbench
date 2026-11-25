/** Defines production viewport faults exercised through disposable predicate copies. */
export const lineageMutants: [string, string, string, string][] = [
  [
    'lineage-review',
    'scripts/lineage-mutation-cases.ts',
    "const packingDecision = '(OVERVIEW_H - 16) * zoom >= minimumNameHeight';",
    "const packingDecision = '(OVERVIEW_H - 16) * zoom < minimumNameHeight';",
  ],
  ['lineage-review', 'scripts/lineage-mutation-cases.ts', "const packingEligibility = '!cards.every(card => card.overview)';", "const packingEligibility = 'false';"],
  ['lineage-review', 'scripts/lineage-mutation-cases.ts', "const nameCompensation = 'Math.max(CARD_NAME_PX, NAME_MIN_PX / zoom)';", "const nameCompensation = 'CARD_NAME_PX';"],
  ['lineage-review', 'scripts/lineage-mutation-cases.ts', "const targetCompensation = 'Math.max(24, 24 / zoom)';", "const targetCompensation = '24';"],
  [
    'lineage-review',
    'scripts/lineage-mutation-cases.ts',
    "const reachDecision = '(right - left) * zoom + margin * 2 <= view.width && (bottom - top) * zoom + margin * 2 <= view.height';",
    "const reachDecision = 'true';",
  ],
];
