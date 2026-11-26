// The agent panel: closed, open and waiting in three viewports, then the error, connecting, connected
// and long-text states with a reference agent on the relay.
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { startPanelServer } from '../../../tests/acp/helpers/panel-server';
import { startRelay } from '../../../tests/acp/helpers/relay-process';
import { attempt, capture, newPage, type CaptureSession, type Viewport } from './session';

type PanelServer = Awaited<ReturnType<typeof startPanelServer>>;

/** Which images to take: all of them, only the closed workspace, or only the open panel in the other viewports. */
export type AgentPanelPart = 'all' | 'closed' | 'open';

// The panel fixture's own port in the capture range; the browser check uses another one.
const PANEL_PORT = 5451;

function viewportsFor(part: AgentPanelPart): Viewport[] {
  if (part === 'open') {
    return [
      [1280, 'dark'],
      [390, 'light'],
    ];
  }
  return [
    [1280, 'light'],
    [1280, 'dark'],
    [390, 'light'],
  ];
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Agent panel', exact: true }).click();
}

async function sendMessage(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message to your agent' }).fill(text);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

/**
 * Starts a session, photographing the connecting state while the server's answer is held,
 * and returns the session id once the panel waits for the agent.
 */
async function startSession(session: CaptureSession, page: Page) {
  const held = Promise.withResolvers<void>();
  await page.route('**/api/acp/sessions', async route => {
    await held.promise;
    await route.continue();
  });
  const pending = page.waitForResponse(response => response.url().endsWith('/api/acp/sessions') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  const connecting = page.getByRole('heading', { name: 'Connecting', exact: true });
  const hasConnecting = await connecting.waitFor({ timeout: 1500 }).then(
    () => true,
    () => false,
  );
  if (hasConnecting) {
    await capture(session, page, 'connecting', 'dialog[open]');
  } else {
    await attempt(session, 'connecting', async () => {
      throw new Error('The base version has no Connecting block while session creation is pending.');
    });
  }
  held.resolve();
  const created = await (await pending).json();
  await page.unroute('**/api/acp/sessions');
  await page.getByText(/Waiting for your agent/).waitFor();
  return created.id as string;
}

async function captureSessionError(session: CaptureSession, page: Page) {
  await page.route('**/api/acp/sessions', route => route.fulfill({ status: 503, json: { error: 'Connection setup unavailable.' } }));
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await capture(session, page, 'error', 'dialog[open]');
  await page.unroute('**/api/acp/sessions');
}

/** The full conversation walk in light at desktop width. */
async function captureConversation(session: CaptureSession, server: PanelServer, page: Page) {
  await capture(session, page, 'open-empty', 'dialog[open]');
  await captureSessionError(session, page);
  const sessionId = await startSession(session, page);
  await capture(session, page, 'waiting', '.agent-panel');
  const stored = server.service.store.findForRelay(sessionId)!;
  const replies = [[{ say: 'Definitions reviewed.' }], [{ say: 'Long definition path/'.repeat(100) }]];
  const relay = await startRelay(server, { id: stored.id, code: stored.code! }, replies);
  try {
    await page.getByText('reference-agent · Connected', { exact: true }).waitFor({ timeout: 30000 });
    await sendMessage(page, 'Review definitions');
    await page.getByLabel('Conversation').getByText('Definitions reviewed.').waitFor();
    await capture(session, page, 'connected-conversation', '.agent-panel');
    await sendMessage(page, 'Show the long path');
    await page
      .getByLabel('Conversation')
      .getByText(/Long definition path/)
      .waitFor();
    await capture(session, page, 'long-text', '.agent-panel');
  } finally {
    await relay.stop();
  }
}

async function captureViewport(session: CaptureSession, server: PanelServer, part: AgentPanelPart, [width, theme]: Viewport) {
  const desktopLight = width === 1280 && theme === 'light';
  const page = await newPage(session, width, theme);
  try {
    await page.goto(server.url);
    if (desktopLight) {
      await page.locator('.full-graph-loading').waitFor({ state: 'detached' });
      await capture(session, page, 'closed', 'body');
    }
    if (part === 'closed') return;
    await openPanel(page);
    if (desktopLight) {
      await captureConversation(session, server, page);
    } else {
      await page.getByRole('button', { name: 'Start session', exact: true }).click();
      await page.getByText(/Waiting for your agent/).waitFor();
      await capture(session, page, 'open-empty', '.agent-panel', theme);
    }
  } finally {
    await page.close();
    // Each viewport starts from a server with no session left over.
    server.restart();
  }
}

export async function captureAgentPanel(session: CaptureSession, part: AgentPanelPart) {
  const server = await startPanelServer({ examples: ['mapped-commerce'], port: PANEL_PORT, staticRoot: resolve('dist') });
  try {
    for (const viewport of viewportsFor(part)) {
      await attempt(session, `agent-${viewport[0]}-${viewport[1]}`, () => captureViewport(session, server, part, viewport));
      if (part === 'closed') break;
    }
  } finally {
    await server.close();
  }
}
