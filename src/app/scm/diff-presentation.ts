/** Names a missing destination without implying that the committed source is a new file. */
export function diffAfterLabel(afterExists: boolean, destination: string, version: string): string {
  if (afterExists) return version;
  return destination === 'index' ? 'Deleted (staged)' : 'Deleted';
}

/** Identical text describes two existing versions, including two genuinely empty files. */
export function identicalVersions(before: string, after: string, beforeExists: boolean, afterExists: boolean): boolean {
  return beforeExists && afterExists && before === after;
}
