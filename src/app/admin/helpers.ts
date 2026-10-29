import { kindWords } from '../graph/text-fit';

/** Turns an action identifier such as `approveMetric` into the label "Approve metric". */
export function actionLabel(action: string): string {
  const words = kindWords(action);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Shows a server timestamp in the reader's locale, or the text as sent when it is not a date. */
export function whenLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}

/** Creates a random lower-case hex identifier for a new grant, role or policy rule. */
// crypto.randomUUID exists only in secure contexts, and a team workbench may be reached over
// plain HTTP inside a private network, so the identifier is built from getRandomValues instead.
export function newIdentifier(prefix: 'g_' | 'r_' | 'p_'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return prefix + hex;
}
