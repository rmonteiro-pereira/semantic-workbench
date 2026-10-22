/** Shows a server timestamp in the reader's locale, or the text as sent when it is not a date. */
export function whenLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}
