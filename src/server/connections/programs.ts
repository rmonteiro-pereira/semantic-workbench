// The agent programs an Admin has registered: their typed form, the rules for redirect addresses, and lookup by client id. Nothing here fetches an address a caller supplied.
import { isOfferedScope, type OfferedScope } from './scopes';

/** One registered program. It holds no secret, because every program is a public client that relies on PKCE and its exact redirect address. */
export type Program = {
  clientId: string;
  name: string;
  description: string;
  redirectUris: string[];
  scopes: OfferedScope[];
  setupNote: string;
};

/** The document `programs.json` of the administration repository. */
export type ProgramsFile = { formatVersion: 1; programs: Program[] };

/** One refusal with the field it concerns, so the Admin screen can point at it. */
export type ProgramIssue = { field: string; message: string };

/** The most programs one workbench registers. Assumed: tens of people use a handful of agent programs. */
export const MAX_PROGRAMS = 50;
/** The most redirect addresses of one program. Assumed: a program needs one or two callback ports. */
export const MAX_REDIRECT_URIS = 5;
/** The longest redirect address. Assumed. */
export const MAX_REDIRECT_URI_LENGTH = 512;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SETUP_NOTE_LENGTH = 1000;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
const PROGRAM_FIELDS = ['clientId', 'name', 'description', 'redirectUris', 'scopes', 'setupNote'];
/** Hosts that mean the machine the person is sitting at. */
const LOOPBACK_HOSTS = ['127.0.0.1', '[::1]', 'localhost'];

/**
 * Why an address cannot be registered, or null when it can. The authorization specification
 * requires every redirect address to be `https` or on the loopback host, so custom schemes are not accepted.
 */
export function redirectIssue(address: unknown): string | null {
  if (typeof address !== 'string' || address === '') return 'Enter an address.';
  if (address.length > MAX_REDIRECT_URI_LENGTH) return `Use at most ${MAX_REDIRECT_URI_LENGTH} characters.`;
  if (/[\s\\\u0000-\u001f\u007f]/.test(address)) return 'The address must not contain spaces, backslashes or control characters.';
  if (address.includes('#')) return 'The address must not contain a fragment.';
  if (address.includes('*')) return 'The address must not contain a wildcard.';
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return 'Enter an absolute address such as https://example.com/callback.';
  }
  if (url.username !== '' || url.password !== '') return 'The address must not contain a user name or password.';
  if (url.protocol === 'https:') return url.hostname === '' ? 'The address needs a host.' : null;
  if (url.protocol !== 'http:') return 'Use https, or http on a loopback host.';
  if (!LOOPBACK_HOSTS.includes(url.hostname)) return 'http is allowed only on 127.0.0.1, [::1] or localhost.';
  // The default port is dropped by the address parser, so the registered text is what shows whether a port was given.
  if (!/^http:\/\/(127\.0\.0\.1|\[::1\]|localhost):\d{1,5}(\/|$)/.test(address)) return 'A loopback address needs an explicit port.';
  return null;
}

function stringIssue(value: unknown, field: string, minimum: number, maximum: number): ProgramIssue | null {
  if (typeof value !== 'string') return { field, message: 'Enter text.' };
  if (value.length < minimum) return { field, message: 'This field is required.' };
  if (value.length > maximum) return { field, message: `Use at most ${maximum} characters.` };
  return null;
}

function redirectIssues(program: Record<string, unknown>, prefix: string): ProgramIssue[] {
  const addresses = program.redirectUris;
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > MAX_REDIRECT_URIS) {
    return [{ field: `${prefix}.redirectUris`, message: `Give one to ${MAX_REDIRECT_URIS} redirect addresses.` }];
  }
  const issues: ProgramIssue[] = [];
  addresses.forEach((address, index) => {
    const message = redirectIssue(address);
    if (message) issues.push({ field: `${prefix}.redirectUris[${index}]`, message });
    else if (addresses.indexOf(address) !== index) issues.push({ field: `${prefix}.redirectUris[${index}]`, message: 'This address is listed twice.' });
  });
  return issues;
}

function scopeIssues(program: Record<string, unknown>, prefix: string): ProgramIssue[] {
  const scopes = program.scopes;
  if (!Array.isArray(scopes)) return [{ field: `${prefix}.scopes`, message: 'Choose the scopes the program may request.' }];
  const issues: ProgramIssue[] = [];
  scopes.forEach((scope, index) => {
    if (scope === 'administration') issues.push({ field: `${prefix}.scopes[${index}]`, message: 'The administration scope is not available yet.' });
    else if (typeof scope !== 'string' || !isOfferedScope(scope)) issues.push({ field: `${prefix}.scopes[${index}]`, message: 'This is not a scope.' });
  });
  if (new Set(scopes).size !== scopes.length) issues.push({ field: `${prefix}.scopes`, message: 'A scope is listed twice.' });
  return issues;
}

function programIssues(value: unknown, index: number): ProgramIssue[] {
  const prefix = `programs[${index}]`;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ field: prefix, message: 'Expected a program.' }];
  const program = value as Record<string, unknown>;
  const issues: ProgramIssue[] = [];
  for (const name of Object.keys(program)) if (!PROGRAM_FIELDS.includes(name)) issues.push({ field: `${prefix}.${name}`, message: 'This field is not part of a program.' });
  if (typeof program.clientId !== 'string' || !CLIENT_ID_PATTERN.test(program.clientId)) {
    issues.push({ field: `${prefix}.clientId`, message: 'Use 3 to 64 letters, digits, dots, underscores or hyphens.' });
  }
  const checks = [
    stringIssue(program.name, `${prefix}.name`, 1, MAX_NAME_LENGTH),
    stringIssue(program.description, `${prefix}.description`, 0, MAX_DESCRIPTION_LENGTH),
    stringIssue(program.setupNote, `${prefix}.setupNote`, 0, MAX_SETUP_NOTE_LENGTH),
  ];
  for (const check of checks) if (check) issues.push(check);
  return [...issues, ...redirectIssues(program, prefix), ...scopeIssues(program, prefix)];
}

/** Checks a whole document and says which field is wrong. Programs missing optional text are not accepted, so a stored document always has every field. */
export function programsIssues(value: unknown): ProgramIssue[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [{ field: 'programs', message: 'Expected a document.' }];
  const document = value as Record<string, unknown>;
  const issues: ProgramIssue[] = [];
  for (const name of Object.keys(document)) if (name !== 'formatVersion' && name !== 'programs') issues.push({ field: name, message: 'This field is not part of the document.' });
  if (document.formatVersion !== 1) issues.push({ field: 'formatVersion', message: 'Expected format version 1.' });
  if (!Array.isArray(document.programs)) return [...issues, { field: 'programs', message: 'Expected a list of programs.' }];
  if (document.programs.length > MAX_PROGRAMS) issues.push({ field: 'programs', message: `Register at most ${MAX_PROGRAMS} programs.` });
  document.programs.forEach((program, index) => issues.push(...programIssues(program, index)));
  const seen = new Set<string>();
  document.programs.forEach((program: { clientId?: unknown }, index) => {
    if (typeof program?.clientId !== 'string') return;
    if (seen.has(program.clientId)) issues.push({ field: `programs[${index}].clientId`, message: 'This client id is already used.' });
    seen.add(program.clientId);
  });
  return issues;
}

export type ProgramsParse = { ok: true; file: ProgramsFile } | { ok: false; issues: ProgramIssue[] };

/** Parses a stored or proposed document into its typed form. */
export function parseProgramsFile(value: unknown): ProgramsParse {
  const issues = programsIssues(value);
  if (issues.length) return { ok: false, issues };
  return { ok: true, file: structuredClone(value) as ProgramsFile };
}

/** The document of a workbench that registered nothing. */
export function emptyProgramsFile(): ProgramsFile {
  return { formatVersion: 1, programs: [] };
}

/** Finds a program by its exact client id. */
export function findProgram(file: ProgramsFile, clientId: string): Program | undefined {
  return file.programs.find(program => program.clientId === clientId);
}
