// Decides which days of counts are still kept. Days are UTC calendar days, so a restart or a change
// of server time zone never splits or merges a day. Nothing here touches a file.

const DAY_FILE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

/** The UTC calendar day of a moment, as `yyyy-mm-dd`. */
export function utcDay(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/** True for a real calendar day written as `yyyy-mm-dd`. */
export function isDay(text: string): boolean {
  if (!DAY_FILE.test(text)) return false;
  const parsed = new Date(text + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && utcDay(parsed) === text;
}

/** The day a number of days before another day. */
export function daysBefore(day: string, count: number): string {
  return utcDay(new Date(Date.parse(day + 'T00:00:00.000Z') - count * MILLISECONDS_PER_DAY));
}

/** The days of a period ending today, oldest first; `length` days including today. */
export function periodDays(today: string, length: number): string[] {
  return Array.from({ length }, (_, index) => daysBefore(today, length - 1 - index));
}

/**
 * The days to delete: those older than the retention period. With retention of N days, today and
 * the N - 1 days before it are kept. A day later than today (the clock went back) is kept.
 */
export function expiredDays(days: readonly string[], today: string, retentionDays: number): string[] {
  const oldestKept = daysBefore(today, retentionDays - 1);
  return days.filter(day => isDay(day) && day < oldestKept);
}
