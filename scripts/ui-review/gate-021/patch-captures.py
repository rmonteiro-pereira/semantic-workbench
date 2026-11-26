"""Expand existing capture entry points without changing application files."""

from pathlib import Path


for side in ["main", "candidate"]:
    directory = Path("/srv/dev/sw/021-journey") / side
    authentication = directory / "scripts/auth-environment.ts"
    text = authentication.read_text()
    if "recordAuthFixture" not in text:
        text = "import { recordAuthFixture } from './ui-review/gate-021/data';\n" + text
        text = text.replace("await options.prepare?.(fixture.root);", "await options.prepare?.(fixture.root);\n    if (!local) recordAuthFixture(fixture.root);")
        authentication.write_text(text)
    isolated = directory / "scripts/helpers/isolated-api.ts"
    text = isolated.read_text()
    if "Math.random() * 30" in text:
        isolated.write_text("let nextApiPort = 5460;\n" + text.replace("5460 + Math.floor(Math.random() * 30)", "nextApiPort++"))
    processes = directory / "scripts/helpers/processes.ts"
    text = processes.read_text()
    if "Math.random() * 18" in text:
        processes.write_text("let nextCapturePort = 5430;\n" + text.replace("5430 + Math.floor(Math.random() * 18)", "nextCapturePort++"))
    session = directory / "scripts/ui-review/feature-states/session.ts"
    text = session.read_text()
    if "matrixCapture" not in text:
        text = "import { matrixCapture } from '../gate-021/variants';\n" + text
        text = text.replace("export async function capture(", "async function captureCurrent(")
        text = text.replace("width = 1280", "width = 1440")
        text += """
/** Captures the current state across the required theme and viewport variants. */
export async function capture(...args: Parameters<typeof captureCurrent>) {
  const [session, page, state, selector] = args;
  return matrixCapture(captureCurrent, session, page, state, selector);
}
"""
        session.write_text(text)
    settings = directory / "specs/021-loose-ends/settings-review/capture-settings.ts"
    text = settings.read_text()
    if "async function shotCurrent" not in text:
        text = text.replace("async function shot(", "async function shotCurrent(")
        text += """
async function shot(page: Page, screen: string, state: string, ...parameters: [string?, number?, string?]) {
  const viewport = page.viewportSize()!;
  const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
  try {
    for (const theme of ['light', 'dark']) {
      for (const width of [390, 1440]) {
        await shotCurrent(page, screen, state, theme, width, parameters[2]);
      }
    }
  } finally {
    await page.setViewportSize(viewport);
    await page.evaluate(value => document.documentElement.dataset.theme = value, originalTheme);
  }
}
"""
        settings.write_text(text)
