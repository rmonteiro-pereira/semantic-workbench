import type { Page } from '@playwright/test';

/** Records resize-loop events that browsers may omit from the pageerror event. */
export async function recordResizeErrors(page: Page, onError: (message: string) => void) {
  await page.exposeFunction('__workbenchResizeError', onError);
  await page.addInitScript(() => {
    window.addEventListener('error', event => {
      if (!event.message.startsWith('ResizeObserver loop')) return;
      const reporter = window as typeof window & {
        __workbenchResizeError: (message: string) => Promise<void>;
      };
      void reporter.__workbenchResizeError(event.message);
    });
  });
}
