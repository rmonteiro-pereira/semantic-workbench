import type { VersionDiff } from './types';
/** Converts the server's per-file unified patches into the two text panes of the existing diff. */
export function patchDiffs(patches: Record<string, string>): VersionDiff[] {
  return Object.entries(patches).map(([file, patch]) => {
    const before: string[] = [];
    const after: string[] = [];
    let inHunk = false;
    for (const line of patch.split('\n')) {
      if (line.startsWith('@@')) {
        if (inHunk) {
          before.push('…');
          after.push('…');
        }
        inHunk = true;
        continue;
      }
      if (!inHunk) continue;
      if (line.startsWith(' ') || line.startsWith('-')) before.push(line.slice(1));
      if (line.startsWith(' ') || line.startsWith('+')) after.push(line.slice(1));
    }
    return { file, before: before.join('\n'), after: after.join('\n') };
  });
}
