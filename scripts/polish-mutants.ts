// Focused faults guard readable graph details, contained labels and actionable save refusals.
// Each tuple names the category, module, original text and replacement.
export const polishMutants: [string, string, string, string][] = [
  [
    'edge-appearance',
    'src/app/graph/edge-styles.ts',
    'return {\n    id: props.id,',
    'return {\n    ...props,\n    id: props.id,',
  ],
  ['tree-viewport', 'src/app/projects/tree-viewport.ts', 'bottom <= available', 'true'],
  [
    'tree-viewport',
    'src/app/projects/tree-viewport.ts',
    'Math.max(...boundaries)',
    'Math.min(...boundaries)',
  ],
  ['tree-viewport', 'src/app/projects/tree-viewport.ts', ': available;', ': 0;'],
  [
    'edge-label-bounds',
    'src/app/odcs/edge-labels.ts',
    'if (outside) continue;',
    'if (false) continue;',
  ],
  [
    'edge-label-bounds',
    'src/app/odcs/edge-labels.ts',
    'placeEdgeLabels(requests, obstacles, bounds)',
    'placeEdgeLabels(requests, obstacles)',
  ],
  [
    'graph-detail-zoom',
    'src/app/graph/overview-capacity.ts',
    'const showDetail = zoom >= 1;',
    'const showDetail = zoom >= READABLE_ZOOM;',
  ],
  [
    'save-failure-wording',
    'src/app/projects/autosave.ts',
    'return refusal[1]!;',
    'return message;',
  ],
  [
    'save-failure-wording',
    'src/app/projects/autosave.ts',
    '/^Refused:\\s*(.+)$/',
    '/^Denied:\\s*(.+)$/',
  ],
  [
    'save-failure-wording',
    'src/app/projects/autosave.ts',
    "return 'the save failed';",
    "return '';",
  ],
];
