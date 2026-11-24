// Validates the query of an authorization request into a typed request, or refuses it. A refused request is never redirected anywhere: the person sees an error page, because an address the program supplied cannot be trusted until it matches a registration exactly.
import { isWellFormedChallenge } from './pkce';
import { findProgram, type Program, type ProgramsFile } from './programs';
import { DEFAULT_SCOPES, parseScopeParameter, type OfferedScope } from './scopes';

/** The longest `state`. Assumed: a state is a random value, not data. */
export const MAX_STATE_LENGTH = 512;
// Assumed parameter bound limits parsing before registered redirect validation.
const MAX_PARAMETER_LENGTH = 2048;

/** A request that passed every check. */
export type AuthorizationRequest = {
  program: Program;
  redirectUri: string;
  scopes: OfferedScope[];
  state?: string;
  codeChallenge: string;
  resource: string;
};

export type AuthorizationParse = { ok: true; request: AuthorizationRequest } | { ok: false };

/** Reads each parameter once. A repeated or over-long parameter is refused, because the standard allows neither. */
function singleParameters(query: URLSearchParams): Map<string, string> | null {
  const values = new Map<string, string>();
  for (const [name, value] of query) {
    if (values.has(name) || value.length > MAX_PARAMETER_LENGTH) return null;
    values.set(name, value);
  }
  return values;
}

/** The scopes asked for, within what the program may request. No scope asks for the defaults the program may have. */
function requestedScopes(parameter: string | undefined, program: Program): OfferedScope[] | null {
  const parsed = parseScopeParameter(parameter);
  if (!parsed.ok) return null;
  if (parsed.scopes.length === 0) return DEFAULT_SCOPES.filter(scope => program.scopes.includes(scope));
  return parsed.scopes.every(scope => program.scopes.includes(scope)) ? parsed.scopes : null;
}

export function parseAuthorizationRequest(query: URLSearchParams, registered: ProgramsFile, resource: string): AuthorizationParse {
  const values = singleParameters(query);
  if (!values) return { ok: false };
  const program = findProgram(registered, values.get('client_id') ?? '');
  const redirectUri = values.get('redirect_uri') ?? '';
  const challenge = values.get('code_challenge') ?? '';
  const state = values.get('state');
  if (!program || !program.redirectUris.includes(redirectUri)) return { ok: false };
  if (values.get('response_type') !== 'code' || values.get('code_challenge_method') !== 'S256' || !isWellFormedChallenge(challenge)) return { ok: false };
  if (values.get('resource') !== resource) return { ok: false };
  if (state !== undefined && state.length > MAX_STATE_LENGTH) return { ok: false };
  const scopes = requestedScopes(values.get('scope'), program);
  if (!scopes || scopes.length === 0) return { ok: false };
  return { ok: true, request: { program, redirectUri, scopes, ...(state === undefined ? {} : { state }), codeChallenge: challenge, resource } };
}
