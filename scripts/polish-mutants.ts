// Faults in the wording of refusals shown to people, apart from the older inventory. Each tuple is
// the category, the module, the exact text and its replacement.
export const polishMutants: [string, string, string, string][] = [
  [
    'graph-detail-zoom',
    'src/graph/overview-capacity.ts',
    'const showDetail = zoom >= 1;',
    'const showDetail = zoom >= READABLE_ZOOM;',
  ],
  ['save-failure-wording', 'src/projects/autosave.ts', 'return refusal[1]!;', 'return message;'],
  [
    'save-failure-wording',
    'src/projects/autosave.ts',
    '/^Refused:\\s*(.+)$/',
    '/^Denied:\\s*(.+)$/',
  ],
  ['save-failure-wording', 'src/projects/autosave.ts', "return 'the save failed';", "return '';"],
];
