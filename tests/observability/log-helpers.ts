// Reads a log level the way start-up does, so tests can check the environment variable's meaning.
import { readObservability, type LogLevel } from '../../src/server/observability/settings';

/** The level `SW_LOG_LEVEL` selects. */
export function parseLevel(value: string | undefined): LogLevel {
  return readObservability({ SW_LOG_LEVEL: value }, false, []).logLevel;
}
