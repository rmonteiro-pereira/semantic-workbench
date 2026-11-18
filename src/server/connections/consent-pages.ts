// The pages a person sees while connecting an agent: consent, the setup credential form, the page that shows the credential once, and one error page. They are server-rendered without script, escape every dynamic value, and never repeat a request parameter.
import { authDocument, escapeHtml } from '../routes/auth';
import type { Program } from './programs';
import { SCOPE_WORDING, type OfferedScope } from './scopes';

/** The statement about onward use, in the words the decisions file fixes. It is also in the guide. */
export const ONWARD_USE_SENTENCE =
  'Semantic Workbench does not call a language model. When you connect an external agent, that agent can receive definitions you authorize and may send them to its model provider; its configuration and policies govern that onward use.';
const SESSION_SENTENCE = 'This connection ends when you sign out or your session expires, which can be as soon as the end of the day.';
const ROLES_SENTENCE = 'The agent acts as you, with your roles, and can read whatever you can read.';
const REMOTE_WARNING = 'The agent can push with your Git credential.';
const NOT_ALLOWED_REASON = 'Your roles do not allow this.';

/** One scope as a person sees it. */
export type ScopeRow = { scope: OfferedScope; checked: boolean; available: boolean };

/** The refusals before consent. The page says one of these sentences and never the cause. */
const ERROR_SENTENCES = {
  invalid: 'This request cannot be completed. Start again from your agent program.',
  finished: 'This request is already finished. Start again from your agent program.',
  limit: 'You already have the most connections allowed. End one in your list of agent connections, then start again.',
  unavailable: 'That choice is not available. Go back and choose again.',
} as const;
export type ErrorKind = keyof typeof ERROR_SENTENCES;

/** Headers every page of this flow carries, on top of the sign-in pages' own. */
function pageHeaders(formActionOrigin?: string): Record<string, string> {
  const formAction = formActionOrigin ? `'self' ${formActionOrigin}` : "'self'";
  return {
    'Content-Security-Policy': `default-src 'none'; img-src 'self'; style-src 'self'; form-action ${formAction}; base-uri 'none'; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };
}

function scopeRowHtml(row: ScopeRow): string {
  const wording = SCOPE_WORDING[row.scope];
  const disabled = row.available ? '' : ' disabled';
  const checked = row.checked && row.available ? ' checked' : '';
  const reason = row.available ? '' : `<span class="scope-reason">${NOT_ALLOWED_REASON}</span>`;
  const warning = row.scope === 'remote' ? `<span class="scope-warning">${REMOTE_WARNING}</span>` : '';
  return (
    `<li class="scope${row.available ? '' : ' scope-unavailable'}"><label><input type="checkbox" name="scope" value="${row.scope}"${checked}${disabled}>` +
    `<span class="scope-text"><span class="scope-name">${escapeHtml(wording.label)}</span>` +
    `<span class="scope-allows">${escapeHtml(wording.allows)}</span>${warning}${reason}</span></label></li>`
  );
}

function scopeListHtml(rows: ScopeRow[]): string {
  return `<fieldset class="scopes"><legend>What it will be able to do</legend><ul>${rows.map(scopeRowHtml).join('')}</ul></fieldset>`;
}

function hiddenField(name: string, value: string): string {
  return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
}

function reminderHtml(): string {
  return `<p>${SESSION_SENTENCE}</p><p class="onward">${ONWARD_USE_SENTENCE}</p>`;
}

/** The program's registered redirect address is shown in full, so a person sees where the answer goes. */
export type ConsentInput = { program: Program; redirectUri: string; personName: string; rows: ScopeRow[]; pendingId: string; csrf: string };

export function consentPage(input: ConsentInput): Response {
  const { program } = input;
  const note = program.setupNote ? `<p class="note">${escapeHtml(program.setupNote)}</p>` : '';
  const description = program.description ? `<p>${escapeHtml(program.description)}</p>` : '';
  const content =
    `<p class="lead"><strong>${escapeHtml(program.name)}</strong> asks to connect as ${escapeHtml(input.personName)}, with your roles.</p>` +
    description +
    `<p>When you allow it, you are sent back to <span class="address">${escapeHtml(input.redirectUri)}</span>.</p>` +
    `<form method="post" action="/oauth/consent">${hiddenField('pending', input.pendingId)}${hiddenField('csrf', input.csrf)}` +
    scopeListHtml(input.rows) +
    `<p>${ROLES_SENTENCE}</p>${reminderHtml()}${note}` +
    '<div class="actions"><button type="submit" name="decision" value="allow" class="primary">Allow</button>' +
    '<button type="submit" name="decision" value="deny">Deny</button></div></form>';
  return authDocument('Connect an agent', content, 200, pageHeaders(new URL(input.redirectUri).origin));
}

/** The form that starts a setup credential for a headless program. */
export type SetupFormInput = { programs: Program[]; personName: string; rows: ScopeRow[]; csrf: string };

export function setupFormPage(input: SetupFormInput): Response {
  const programs = input.programs
    .map((program, index) => {
      const checked = index === 0 ? ' checked' : '';
      const description = program.description ? `<span class="program-description">${escapeHtml(program.description)}</span>` : '';
      const note = program.setupNote ? `<span class="program-description">${escapeHtml(program.setupNote)}</span>` : '';
      return (
        `<li class="scope"><label><input type="radio" name="client" value="${escapeHtml(program.clientId)}"${checked}>` +
        `<span class="scope-text"><span class="scope-name">${escapeHtml(program.name)}</span>${description}${note}</span></label></li>`
      );
    })
    .join('');
  const content =
    `<p class="lead">Set up a headless agent as ${escapeHtml(input.personName)}, with your roles. You get one setup credential that works once, for ten minutes.</p>` +
    `<form method="post" action="/oauth/setup">${hiddenField('csrf', input.csrf)}` +
    `<fieldset class="scopes"><legend>Program</legend><ul>${programs}</ul></fieldset>` +
    scopeListHtml(input.rows) +
    `<p>${ROLES_SENTENCE}</p>${reminderHtml()}` +
    '<div class="actions"><button type="submit" class="primary">Create setup credential</button><a href="/">Cancel</a></div></form>';
  return authDocument('Set up a headless agent', content, 200, pageHeaders());
}

/** The credential is shown once, in a box that wraps, and is never in an address. */
export type SetupResultInput = { credential: string; expiresAtIso: string; serverUrl: string };

export function setupResultPage(input: SetupResultInput): Response {
  const command = `SW_SERVER_URL=${escapeHtml(input.serverUrl)} SW_SETUP_CREDENTIAL=&lt;paste the setup credential here&gt; bun scripts/mcp-stdio.ts`;
  const content =
    '<p class="lead">Copy this setup credential now. It is shown once and works once.</p>' +
    `<p class="credential" id="credential">${escapeHtml(input.credential)}</p>` +
    `<p>It expires at <time datetime="${escapeHtml(input.expiresAtIso)}">${escapeHtml(input.expiresAtIso)}</time>.</p>` +
    `<p>On the machine that runs the agent, start the bridge with it:</p><p class="command">${command}</p>` +
    reminderHtml() +
    '<div class="actions"><a href="/">Back to the workbench</a></div>';
  return authDocument('Your setup credential', content, 200, pageHeaders());
}

/** The error page. It names no cause beyond the sentence and echoes nothing from the request. */
export function errorPage(kind: ErrorKind): Response {
  const content = `<p>${ERROR_SENTENCES[kind]}</p><div class="actions"><a href="/">Back to the workbench</a></div>`;
  return authDocument('Agent connection', content, 400, pageHeaders());
}
