// Matches restricted POSIX paths separately from Cedar's cross-segment wildcard semantics.
const restrictedPatterns = new Map<string, RegExp>();
const rolePatterns = new Map<string, RegExp>();

function literal(character: string): string {
  return character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pattern(glob: string, segmented: boolean): RegExp {
  let source = '^';
  for (let index = 0; index < glob.length; index++) {
    const character = glob[index];
    if (character !== '*') {
      source += literal(character);
      continue;
    }
    if (!segmented) {
      source += '.*';
      continue;
    }
    if (glob[index + 1] !== '*') {
      source += '[^/]*';
      continue;
    }
    index++;
    if (glob[index + 1] === '/') {
      source += '(?:.*/)?';
      index++;
    } else {
      source += '.*';
    }
  }
  return new RegExp(source + '$', 's');
}

/** Matches a relative POSIX path, with double stars spanning directory segments. */
export function matchesSegmentGlob(path: string, glob: string): boolean {
  if (!restrictedPatterns.has(glob)) restrictedPatterns.set(glob, pattern(glob, true));
  return restrictedPatterns.get(glob)!.test(path);
}

/** Matches exactly the wildcard semantics emitted by the role compiler. */
export function matchesCedarLike(path: string, glob: string): boolean {
  if (!rolePatterns.has(glob)) rolePatterns.set(glob, pattern(glob, false));
  return rolePatterns.get(glob)!.test(path);
}
