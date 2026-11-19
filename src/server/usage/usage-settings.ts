// Reads the two environment variables that switch usage counters on and set how long counts are kept.
// Counters are off unless an operator turns them on, so a missing variable is never a problem.

type Env = Record<string, string | undefined>;
type Problem = { variable: string; message: string };

/** What the recorder and the read operation need to know about the operator's choice. */
export type UsageSettings = {
  enabled: boolean;
  retentionDays: number;
};

/** Days of counts kept when the operator does not choose. */
export const DEFAULT_USAGE_RETENTION_DAYS = 30;
/** A year is the longest period a curator would compare. */
export const MAX_USAGE_RETENTION_DAYS = 365;

/** Settings of an instance that counts nothing. */
export const USAGE_OFF: UsageSettings = { enabled: false, retentionDays: DEFAULT_USAGE_RETENTION_DAYS };

/** Reads both variables, adding one problem for each value that is present and invalid. */
export function readUsageSettings(env: Env, problems: Problem[]): UsageSettings {
  return {
    enabled: readSwitch(env.SW_USAGE_COUNTERS, problems),
    retentionDays: readRetention(env.SW_USAGE_RETENTION_DAYS, problems),
  };
}

function readSwitch(value: string | undefined, problems: Problem[]): boolean {
  const text = value?.trim() ?? '';
  if (text === '') return false;
  if (text === 'on') return true;
  problems.push({ variable: 'SW_USAGE_COUNTERS', message: 'must be "on" or unset.' });
  return false;
}

function readRetention(value: string | undefined, problems: Problem[]): number {
  const text = value?.trim() ?? '';
  if (text === '') return DEFAULT_USAGE_RETENTION_DAYS;
  const days = Number(text);
  if (!/^\d+$/.test(text) || days < 1 || days > MAX_USAGE_RETENTION_DAYS) {
    problems.push({ variable: 'SW_USAGE_RETENTION_DAYS', message: `must be a whole number of days from 1 to ${MAX_USAGE_RETENTION_DAYS}.` });
    return DEFAULT_USAGE_RETENTION_DAYS;
  }
  return days;
}
