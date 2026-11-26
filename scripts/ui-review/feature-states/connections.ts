// Person sign-in and agent connections on a shared server: the consent, setup-credential and error pages,
// the person's connections dialog in its states, and both Admin sections.
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { startMockOidc } from '../../../tests/helpers/mock-oidc';
import { pkcePair, referenceProgram } from '../../../tests/helpers/connection-server';
import { startAuthApi } from '../../auth-environment';
import { signIn } from '../../helpers/sign-in';
import { capture, newPage, type CaptureSession, type Viewport } from './session';

const SERVER_URL = 'http://127.0.0.1:5452';
const PROVIDER_PORT = 5453;
// The registered program's callback is never followed; it only has to be a loopback address in range.
const PROGRAM = { ...referenceProgram, redirectUris: ['http://127.0.0.1:5454/callback'] };
const VIEWPORTS: Viewport[] = [
  [1280, 'light'],
  [1280, 'dark'],
  [390, 'light'],
];
type DialogState = 'empty' | 'loading' | 'error' | 'long-text';

function authorizeQuery() {
  return new URLSearchParams({
    response_type: 'code',
    client_id: PROGRAM.clientId,
    redirect_uri: PROGRAM.redirectUris[0],
    code_challenge: pkcePair().challenge,
    code_challenge_method: 'S256',
    resource: SERVER_URL + '/api/mcp',
    scope: 'read edit',
  });
}

function longConnection() {
  return {
    id: 'capture',
    origin: 'acp',
    clientId: PROGRAM.clientId,
    programName: 'Agent program with a long descriptive name '.repeat(5),
    scopes: PROGRAM.scopes,
    createdAt: '2026-11-17T12:00:00Z',
    lastUsedAt: '2026-11-17T12:00:00Z',
    personName: 'Test person with a long display name',
    state: 'active',
  };
}

async function captureDialogState(session: CaptureSession, page: Page, state: DialogState, theme: Viewport[1]) {
  // The loading state holds the answer until the image is taken.
  const held = Promise.withResolvers<void>();
  await page.route('**/api/connections', async route => {
    if (state === 'loading') await held.promise;
    const connections = state === 'long-text' ? [longConnection()] : [];
    await route.fulfill({ status: state === 'error' ? 500 : 200, json: connections });
  });
  await page.goto(SERVER_URL);
  await page.getByRole('button', { name: 'Person menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Agent connections', exact: true }).click();
  await page.waitForTimeout(300);
  await capture(session, page, `person-${state}`, 'dialog[open]', theme);
  held.resolve();
  await page.waitForTimeout(100);
  await page.unroute('**/api/connections');
}

async function captureDesktopPages(session: CaptureSession, page: Page) {
  await page.goto(SERVER_URL + '/oauth/setup');
  await capture(session, page, 'setup-credential', 'main');
  await page.goto(SERVER_URL + '/oauth/authorize?client_id=missing');
  await capture(session, page, 'authorize-error', 'main');
}

async function captureAdminSections(session: CaptureSession, page: Page) {
  for (const section of ['agent-connections', 'agent-programs']) {
    await page.goto(SERVER_URL + '/#/admin/' + section);
    await page.locator('.admin-page').waitFor();
    await page.waitForTimeout(300);
    await capture(session, page, section, '.admin-page');
  }
}

async function captureViewport(session: CaptureSession, issuer: string, [width, theme]: Viewport) {
  const desktopLight = width === 1280 && theme === 'light';
  const page = await newPage(session, width, theme);
  // The sign-in page is driven at desktop width; the viewport under test applies afterwards.
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, { url: SERVER_URL, issuer, kind: 'entra' }, 'dave');
  await page.setViewportSize({ width, height: 900 });
  await page.goto(SERVER_URL + '/oauth/authorize?' + authorizeQuery());
  await page.getByRole('heading', { name: 'Connect an agent', exact: true }).waitFor();
  await capture(session, page, 'consent', 'main', theme);
  if (desktopLight) await captureDesktopPages(session, page);
  const states: DialogState[] = desktopLight ? ['empty', 'loading', 'error', 'long-text'] : ['empty'];
  for (const state of states) await captureDialogState(session, page, state, theme);
  if (desktopLight) await captureAdminSections(session, page);
  await page.close();
}

export async function captureConnections(session: CaptureSession) {
  const provider = await startMockOidc({ port: PROVIDER_PORT, shape: 'entra', redirectUris: [SERVER_URL + '/auth/callback'] });
  const programs = JSON.stringify({ formatVersion: 1, programs: [PROGRAM] });
  const api = await startAuthApi(SERVER_URL, { ...provider, kind: 'entra' }, { prepare: root => Bun.write(join(root, 'admin/programs.json'), programs).then(() => {}) });
  try {
    for (const viewport of VIEWPORTS) await captureViewport(session, provider.endpointBase, viewport);
  } finally {
    await api.stop();
    await provider.stop();
  }
}
