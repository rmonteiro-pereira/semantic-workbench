// Focused faults guard readable graph details, contained labels and actionable save refusals.
// Each tuple names the category, module, original text and replacement.
export const polishMutants: [string, string, string, string][] = [
  [
    'edge-label-bounds',
    'src/odcs/edge-labels.ts',
    'if (outside) continue;',
    'if (false) continue;',
  ],
  [
    'edge-label-bounds',
    'src/odcs/edge-labels.ts',
    'placeEdgeLabels(requests, obstacles, bounds)',
    'placeEdgeLabels(requests, obstacles)',
  ],
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
