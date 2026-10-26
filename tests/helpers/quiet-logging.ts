// Keeps routine request lines out of test output. Failures and unexpected errors still print, and a
// test that checks log lines configures the level it needs and restores this one afterwards.
import { configureLogging } from '../../src/server/observability/log';

/** The logging every test starts with. */
export function useQuietLogging(): void {
  configureLogging({ level: 'error', format: 'text' });
}

useQuietLogging();
