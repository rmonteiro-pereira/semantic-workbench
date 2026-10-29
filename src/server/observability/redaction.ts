// Removes secrets, document content and file locations from anything the server logs or exports.
// Redaction is by field name and by value, so a secret leaks neither under a known key nor
// inside a free-text error message.

/** What replaces a removed value. */
export const REDACTED = '[redacted]';

// A field with one of these names is dropped whole, whatever it holds.
const SECRET_KEY = /token|secret|password|passwd|cookie|authorization|credential|assertion|csrf/i;
const SECRET_KEY_WORDS = /api[-_]?key|private[-_]?key|connection[-_]?string|instrumentation[-_]?key/i;
const SESSION_KEY = /^(session|sid|code|state|nonce|sig|signature)$/i;
// Names that carry what a person wrote or where it lives.
const CONTENT_KEY = /content|source|body|text|diff|payload|stack/i;
const LOCATION_KEY = /path|file|folder|dir|cwd|query|search|url|href|referer|referrer/i;

// Fields written by the logger itself are controlled vocabulary and need no value scan.
const TRUSTED_KEYS = new Set(['event', 'route', 'method', 'level', 'requestId', 'traceId']);
const MAX_STRING_LENGTH = 300;
const MAX_DEPTH = 3;
const MAX_ARRAY_ITEMS = 10;

const JSON_WEB_TOKEN = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
const AUTH_SCHEME = /\b(Bearer|Basic|Negotiate)\s+[\w.~+/=-]{6,}/gi;
const URL_USERINFO = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^@/\s]+@/g;
const URL_QUERY = /(\b[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s?#"']*)\?[^\s#"']*/g;
// A name=value or name: value pair whose name ends in a secret-like word, such as `sw_session`.
const SECRET_NAME = '[\\w-]*(?:token|secret|password|cookie|key|session|signature|assertion)|sig|sas|sid';
const SENSITIVE_ASSIGNMENT = new RegExp(`(\\b(?:${SECRET_NAME})\\s*[=:]\\s*)("[^"]*"|'[^']*'|[^\\s&;,"']+)`, 'gi');
const EMAIL_ADDRESS = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const WINDOWS_PATH = /\b[A-Za-z]:\\[^\s"'<>|]+/g;
const POSIX_PATH = /(?<![\w:/.-])\/(?:[\w.@%+~-]+\/)+[\w.@%+~-]*/g;

/** Options for {@link redactText}. */
export type RedactTextOptions = {
  /** Replaces file system locations. Off for text that is known to hold only route templates. */
  paths?: boolean;
};

/** Removes credentials, query strings and (by default) file locations from free text. */
export function redactText(text: string, options: RedactTextOptions = {}): string {
  let result = text
    .replace(JSON_WEB_TOKEN, REDACTED)
    .replace(AUTH_SCHEME, `$1 ${REDACTED}`)
    .replace(URL_USERINFO, '$1***@')
    .replace(URL_QUERY, `$1?${REDACTED}`)
    .replace(SENSITIVE_ASSIGNMENT, `$1${REDACTED}`)
    .replace(EMAIL_ADDRESS, '<address>');
  if (options.paths !== false) {
    result = result.replace(WINDOWS_PATH, '<path>').replace(POSIX_PATH, '<path>');
  }
  return result.length > MAX_STRING_LENGTH ? `${result.slice(0, MAX_STRING_LENGTH)}...` : result;
}

/** True when a field of this name is dropped without looking at its value. */
export function isSensitiveKey(key: string): boolean {
  return SECRET_KEY.test(key) || SECRET_KEY_WORDS.test(key) || SESSION_KEY.test(key) || CONTENT_KEY.test(key) || LOCATION_KEY.test(key);
}

/** A structured log field value after redaction. */
export type SafeValue = string | number | boolean | null | SafeValue[] | { [key: string]: SafeValue };

/** Redacts a record of log fields: sensitive names are dropped, every other value is scanned. */
export function redactFields(fields: Record<string, unknown>, depth = 0): Record<string, SafeValue> {
  const safe: Record<string, SafeValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (!TRUSTED_KEYS.has(key) && isSensitiveKey(key)) {
      safe[key] = REDACTED;
      continue;
    }
    safe[key] = redactValue(value, TRUSTED_KEYS.has(key), depth);
  }
  return safe;
}

function redactValue(value: unknown, trusted: boolean, depth: number): SafeValue {
  if (value === null) return null;
  if (typeof value === 'string') return trusted ? value : redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return redactText(`${value.name}: ${value.message}`);
  if (depth >= MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map(item => redactValue(item, false, depth + 1));
  }
  if (typeof value === 'object') return redactFields(value as Record<string, unknown>, depth + 1);
  return REDACTED;
}

/** The name and redacted message of a failure, which is all a log line keeps of it. */
export function describeError(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: redactText(error.message) };
  }
  return { errorName: 'Error', errorMessage: redactText(String(error)) };
}
