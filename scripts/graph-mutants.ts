/** Faults that break measured legibility or publish an opening decision before layout paint. */
import { resolve, dirname } from 'node:path';

/** Changes the threshold, skips the measured collapse, or reads names before their layout paints. */
export const graphMutants: [string, string, string, string][] = [
  ['graph-capacity', 'src/app/graph/overview-capacity.ts', 'minimumNameHeight < NAME_MIN_PX', 'minimumNameHeight > NAME_MIN_PX'],
  ['graph-capacity', 'src/app/graph/overview-capacity.ts', 'export const NAME_MIN_PX = 9;', 'export const NAME_MIN_PX = 90;'],
  ['graph-opening', 'src/app/graph/useFullGraphOpening.ts', 'await afterPaint();', 'void afterPaint();'],
  ['graph-opening', 'src/app/graph/useFullGraphOpening.ts', 'collapsed: startsCollapsed(entityCount, minimumName)', 'collapsed: false'],
];

/** Runs each candidate with the same graph-opening entry point and browser-rendered name measurement. */
export async function runGraphCase(root: string, temporary: string, file: string, source: string, index: string, category: string) {
  const folder = dirname(resolve(root, file));
  const rewritten = source.replace(/\bfrom\s*(['"])(\.[^'"]+)\1/g, (_all, quote, path) => `from ${quote}${resolve(folder, path)}${quote}`);
  const target = resolve(temporary, `graph-${index}.ts`);
  await Bun.write(target, rewritten);
  const child = Bun.spawn([process.execPath, resolve(root, 'scripts/graph-mutation-cases.ts'), target, category], { stdout: 'pipe', stderr: 'pipe' });
  const timer = setTimeout(() => child.kill(), 10000);
  const code = await child.exited;
  clearTimeout(timer);
  return { code, error: await new Response(child.stderr).text() };
}
