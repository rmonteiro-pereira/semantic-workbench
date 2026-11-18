// Reads a JSON request body under a byte limit without buffering more than the limit, and says why it refused.

/** The result of reading a body. `status` is the HTTP status to answer with. */
export type BodyRead = { ok: true; value: unknown } | { ok: false; status: 400 | 413 };

/** Reads one JSON value of at most `maximumBytes`. A body that declares more is refused unread. */
export async function readBoundedJson(request: Request, maximumBytes: number): Promise<BodyRead> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maximumBytes) return { ok: false, status: 413 };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))) };
  } catch {
    return { ok: false, status: 400 };
  }
}
