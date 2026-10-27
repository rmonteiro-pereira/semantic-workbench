// Faults in the colour-literal scanner, the theme check and the codemod. Each tuple is the
// category, the module, the exact text and its replacement.
export const themeMutants: [string, string, string, string][] = [
  ['theme-scan', 'scripts/helpers/color-literals.ts', '[0-9a-fA-F]{6}|', ''],
  ['theme-scan', 'scripts/helpers/color-literals.ts', '[0-9a-fA-F]{3})(?![', '[0-9a-fA-F]{4})(?!['],
  ['theme-scan', 'scripts/helpers/color-literals.ts', 'rgba?|hsla?|', 'rgba?|'],
  ['theme-scan', 'scripts/helpers/color-literals.ts', "  'white',\n", ''],
  [
    'theme-scan',
    'scripts/helpers/color-literals.ts',
    "if (pair === '/*') {",
    "if (pair === '/#') {",
  ],
  [
    'theme-scan',
    'scripts/helpers/color-literals.ts',
    "if (lineComments && pair === '//')",
    "if (false && pair === '//')",
  ],
  [
    'theme-scan',
    'scripts/helpers/color-literals.ts',
    'if (WHOLE_STRING_HEX.test(body.trim())) {',
    'if (false) {',
  ],
  [
    'theme-scan',
    'scripts/helpers/color-literals.ts',
    'NAMED_COLORS.includes(body.trim())',
    'false',
  ],
  [
    'theme-check',
    'scripts/check-theme.ts',
    'if (!language || isThemeFile(file)) return [];',
    'if (!language) return [];',
  ],
  [
    'theme-check',
    'scripts/check-theme.ts',
    'if (!language || isThemeFile(file)) return [];',
    'if (isThemeFile(file)) return [];',
  ],
  [
    'theme-check',
    'scripts/check-theme.ts',
    '    return 0;\n  }\n  for',
    '    return 0;\n  }\n  return 0;\n  for',
  ],
  [
    'theme-check',
    'scripts/check-theme.ts',
    'return findColorLiterals(text, language).map(',
    'return findColorLiterals(text, language).slice(1).map(',
  ],
  [
    'theme-files',
    'scripts/helpers/theme-files.ts',
    "if (normalized.startsWith('src/generated/')) return null;",
    '',
  ],
  [
    'theme-files',
    'scripts/helpers/theme-files.ts',
    "['src/shared/theme/theme.css', 'src/app/theme/theme-palette.ts']",
    "['src/shared/theme/theme.css']",
  ],
  [
    'theme-codemod',
    'scripts/theme-codemod.ts',
    'if (alpha >= 1) return reference;',
    'if (alpha >= 0) return reference;',
  ],
  [
    'theme-codemod',
    'scripts/theme-codemod.ts',
    'surface: 9,\n  border: 9,',
    'surface: 90,\n  border: 90,',
  ],
  [
    'theme-codemod',
    'scripts/theme-codemod.ts',
    "background: ['surface', 'solid', 'graphic', 'text', 'shadow', 'named'],",
    "background: ['solid', 'text', 'shadow', 'named'],",
  ],
  [
    'theme-codemod',
    'scripts/theme-codemod.ts',
    'color.alpha < 1 && luminance(color) < 0.09',
    'luminance(color) < 0.09',
  ],
];
