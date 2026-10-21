// Reads JSON request bodies with a byte limit before parsing.
/** Parses a body within maxBytes, using empty for an absent or empty optional body. */
export async function readJson(req: Request, maxBytes: number, empty?: object) {
  const reader = req.body?.getReader();
  if (!reader) {
    if (empty) return empty;
    throw Error('Expected a JSON request.');
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw Error('Request too large.');
    }
    chunks.push(value);
  }
  // An optional body may be absent or empty; anything else must be valid JSON within the limit.
  if (!bytes && empty) return empty;
  const raw = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw Error('Malformed JSON request.');
  }
}
