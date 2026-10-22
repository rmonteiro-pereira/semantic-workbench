// Keeps browser checks pointed at the selected frontend independently of the isolated API.
function validateBaseUrl(value: string): string {
  const message = 'SW_BASE_URL must be an absolute http(s) URL.';
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new Error(message, { cause });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(message);
  }
  return url.href.replace(/\/+$/, '');
}

// UI_URL is the older name of the same setting; it keeps working so existing commands do not break.
const configured = process.env.SW_BASE_URL ?? process.env.UI_URL;

/** Frontend address used by browser checks, without a trailing slash. */
export const BASE_URL = validateBaseUrl(configured ?? 'http://127.0.0.1:5173');

/** Joins a frontend path to the configured base address. */
export function appUrl(path = '/'): string {
  return new URL(path.replace(/^\/+/, ''), `${BASE_URL}/`).href;
}
