/** Turns an action identifier such as `approveMetric` into the label "Approve metric". */
export function actionLabel(action: string): string {
  const words = action.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Shows a server timestamp in the reader's locale, or the text as sent when it is not a date. */
export function whenLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}
