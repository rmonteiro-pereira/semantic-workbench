// Waits for the development API to accept requests before the frontend starts proxying to it.

/** What the wait needs from its surroundings, passed in so tests can control time and HTTP. */
export type ReadinessProbe = {
  /** The API's readiness URL, for example http://127.0.0.1:4310/readyz. */
  url: string;
  /** Gives up after this many milliseconds. */
  timeoutMs: number;
  /** Pause between attempts in milliseconds. */
  intervalMs: number;
  /** Returns false once the API process has exited, so the wait stops early. */
  isApiRunning: () => boolean;
  fetch?: (url: string) => Promise<Response>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

/** Why the wait ended. */
export type ReadinessResult = 'ready' | 'api-exited' | 'timed-out';

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function answersReady(fetchUrl: (url: string) => Promise<Response>, url: string) {
  try {
    const response = await fetchUrl(url);
    return response.ok;
  } catch {
    // Connection refused is expected while the API is still scanning the workspace.
    return false;
  }
}

/** Polls the readiness URL until it answers 200, the API exits or the timeout passes. */
export async function waitForApi(probe: ReadinessProbe): Promise<ReadinessResult> {
  const fetchUrl = probe.fetch ?? ((url: string) => fetch(url));
  const sleep = probe.sleep ?? defaultSleep;
  const now = probe.now ?? Date.now;
  const deadline = now() + probe.timeoutMs;

  while (true) {
    if (!probe.isApiRunning()) return 'api-exited';
    if (await answersReady(fetchUrl, probe.url)) return 'ready';
    if (now() >= deadline) return 'timed-out';
    await sleep(probe.intervalMs);
  }
}
