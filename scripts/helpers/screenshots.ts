// Suites can opt into the gate's isolated artifact folder while retaining local paths.
import { basename, join } from 'node:path';

/** Resolves a screenshot destination using the suite environment or its existing default. */
export function screenshotPath(defaultPath: string, directory = process.env.SW_SCREENSHOT_DIR) {
  return directory ? join(directory, basename(defaultPath)) : defaultPath;
}
