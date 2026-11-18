// Reads the small form bodies of the connection endpoints under a byte cap and a per-field cap, and refuses a field that appears twice.
import { readBodyUnderCap } from '../mcp/body-limits';
import { OAUTH_REQUEST_LIMIT } from '../request';

/** The longest value of one field. Assumed: a code challenge is 43 characters and a redirect address at most 512. */
export const MAX_FIELD_LENGTH = 2048;

/** The fields of a form that has none repeated, except those a form may repeat on purpose. */
export type FormFields = { single: Map<string, string>; all: URLSearchParams };

export type FormRead = { ok: true; fields: FormFields } | { ok: false };

/** Reads an `application/x-www-form-urlencoded` body. A repeated field is refused unless it is named in `repeatable`. */
export async function readForm(request: Request, repeatable: string[] = []): Promise<FormRead> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) return { ok: false };
  const body = await readBodyUnderCap(request, OAUTH_REQUEST_LIMIT);
  if (!body.ok) return { ok: false };
  const all = new URLSearchParams(body.text);
  const single = new Map<string, string>();
  for (const [name, value] of all) {
    if (value.length > MAX_FIELD_LENGTH) return { ok: false };
    if (single.has(name) && !repeatable.includes(name)) return { ok: false };
    single.set(name, value);
  }
  return { ok: true, fields: { single, all } };
}
