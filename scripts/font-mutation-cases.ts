// Font asset checks share the same filesystem boundary in tests and mutation runs.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Returns font declarations and asset references that cannot work offline. */
export function fontProblems(root: string): string[] {
  const problems: string[] = [];
  const fontDirectory = resolve(root, 'src/shared/fonts');
  const fontCss = readFileSync(resolve(fontDirectory, 'fonts.css'), 'utf8');
  for (const family of ['DM-Sans', 'Manrope']) {
    const licence = resolve(fontDirectory, `OFL-${family}.txt`);
    if (!existsSync(licence) || !readFileSync(licence, 'utf8').includes('SIL OPEN FONT LICENSE')) problems.push(`Missing licence: ${family}`);
  }
  for (const match of fontCss.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
    const target = resolve(fontDirectory, match[1]);
    if (!target.startsWith(fontDirectory + '/') || !existsSync(target)) problems.push(`Missing font URL: ${match[1]}`);
  }
  for (const file of cssFiles(resolve(root, 'src'))) {
    const css = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@font-face\s*\{[^}]*\}/g, '');
    for (const match of css.matchAll(/(?:^|[;{}])\s*(font(?:-family)?)\s*:\s*([^;{}]+)[;]/g)) {
      if (!/\b(?:sans-serif|serif|monospace|system-ui)\b|var\(--font-[\w-]+\)/.test(match[2])) problems.push(`Missing fallback: ${file}: ${match[1]}: ${match[2].trim()}`);
    }
  }
  return problems;
}

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

if (import.meta.main) {
  const problems = fontProblems(process.argv[2]);
  if (problems.length) throw new Error(problems.join('\n'));
}
