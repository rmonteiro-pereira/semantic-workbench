// Git words a push refusal uses when the remote has commits the local branch does not.
const NOT_INTEGRATED = [/\(non-fast-forward\)/i, /\(fetch first\)/i, /updates were rejected because/i];

/** The plain-language summary shown above the raw Git output of a rejected push. */
export const PUSH_REJECTED_SUMMARY = 'Push rejected: the remote has commits you have not integrated.';

/** Tells whether Git refused a push because the remote holds commits the branch lacks. */
export function isRejectedPush(gitOutput: string): boolean {
  return NOT_INTEGRATED.some(pattern => pattern.test(gitOutput));
}
