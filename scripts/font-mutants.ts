// Asset faults run against isolated copies of the real stylesheet and licence tree.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Faults that remove a fallback, break a font URL, or remove a family licence. */
export const fontMutants: [string, string, string, string][] = [
  ['fonts', 'src/app/style.css', 'font-family: var(--font-sans);', "font-family: 'DM Sans';"],
  ['fonts', 'src/shared/fonts/fonts.css', './dm-sans-variable.woff2', './missing-font.woff2'],
  ['fonts', 'src/shared/fonts/OFL-Manrope.txt', readFileSync('src/shared/fonts/OFL-Manrope.txt', 'utf8'), ''],
];

/** Runs the font gate on a disposable source tree containing one candidate asset. */
export async function runFontCase(root: string, temporary: string, file: string, source: string, index: string) {
  const candidate = resolve(temporary, `fonts-${index}`);
  await mkdir(candidate, { recursive: true });
  await cp(resolve(root, 'src'), resolve(candidate, 'src'), { recursive: true, filter: path => !path.includes('/generated/') });
  const target = resolve(candidate, file);
  if (source) await writeFile(target, source);
  else await rm(target);
  const child = Bun.spawn([process.execPath, resolve(root, 'scripts/font-mutation-cases.ts'), candidate], { stdout: 'pipe', stderr: 'pipe' });
  const code = await child.exited;
  const error = await new Response(child.stderr).text();
  await rm(candidate, { recursive: true, force: true });
  return { code, error };
}
