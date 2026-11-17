// Reads a request body under a byte cap while it streams in, so an oversized body is refused before it is parsed or held whole in memory.
import { FILE_SAVE_REQUEST_LIMIT } from '../request';

/** The largest body any tool call may carry: the save route's own envelope. */
export const GLOBAL_REQUEST_CAP_BYTES = FILE_SAVE_REQUEST_LIMIT;
/** The cap for a call that carries no file text, which is the cap the Git and agent routes already use. */
export const DEFAULT_TOOL_REQUEST_CAP_BYTES = 64_000;

export type BodyRead = { ok: true; text: string } | { ok: false; reason: 'too-large' | 'unreadable' };

/** Reads the body, stopping as soon as the cap is passed, whatever the declared length says. */
export async function readBodyUnderCap(request: Request, capBytes: number): Promise<BodyRead> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > capBytes) return { ok: false, reason: 'too-large' };
  const reader = request.body?.getReader();
  if (!reader) return { ok: true, text: '' };
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      received += part.value.byteLength;
      if (received > capBytes) {
        await reader.cancel();
        return { ok: false, reason: 'too-large' };
      }
      chunks.push(part.value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  return { ok: true, text: new TextDecoder().decode(Buffer.concat(chunks)) };
}
