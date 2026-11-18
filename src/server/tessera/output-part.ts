// Cuts a compiled file into bounded parts for callers that read it page by page, never splitting a character and never skipping a byte.

/** The most bytes one part may hold. */
export const OUTPUT_PART_BYTES = 32_768;

/** One part of a compiled file: where it starts, where the next one starts, and the file's version. */
export type OutputPart = { path: string; version: string; offset: number; nextOffset: number | null; text: string };

/** Says why a part cannot be read. */
export class OutputPartError extends Error {
  constructor(
    readonly reason: 'commit-required' | 'snapshot-changed' | 'offset-out-of-range' | 'offset-inside-character',
    message: string,
  ) {
    super(message);
    this.name = 'OutputPartError';
  }
}

/** What a part is read from: the compiled bytes and the commit and version they belong to. */
export type PartSource = { commit: string; path: string; version: string; bytes: Uint8Array };

/** The request: the commit the caller was shown, the file and the byte offset to start at. */
export type PartRequest = { commit: string | undefined; offset: number };

const CONTINUATION_MASK = 0b1100_0000;
const CONTINUATION_BITS = 0b1000_0000;

function isContinuationByte(byte: number): boolean {
  return (byte & CONTINUATION_MASK) === CONTINUATION_BITS;
}

/** Moves a cut point back to the start of the character it falls inside. */
function characterBoundaryAtOrBefore(bytes: Uint8Array, position: number): number {
  let boundary = position;
  while (boundary > 0 && boundary < bytes.length && isContinuationByte(bytes[boundary])) boundary -= 1;
  return boundary;
}

/** Returns the part of a compiled file that starts at the offset, refusing a request that does not name the commit it was shown. */
export function readOutputPart(source: PartSource, request: PartRequest, limit: number = OUTPUT_PART_BYTES): OutputPart {
  if (request.commit === undefined) throw new OutputPartError('commit-required', 'A part read needs the commit the compile reported.');
  if (request.commit !== source.commit) throw new OutputPartError('snapshot-changed', 'The published snapshot changed since the compile was shown.');
  const { bytes } = source;
  if (!Number.isInteger(request.offset) || request.offset < 0 || request.offset > bytes.length) throw new OutputPartError('offset-out-of-range', 'The offset is outside the file.');
  if (request.offset < bytes.length && isContinuationByte(bytes[request.offset])) throw new OutputPartError('offset-inside-character', 'The offset is inside a character.');
  const end = characterBoundaryAtOrBefore(bytes, Math.min(request.offset + limit, bytes.length));
  const text = new TextDecoder().decode(bytes.subarray(request.offset, end));
  const nextOffset = end < bytes.length ? end : null;
  return { path: source.path, version: source.version, offset: request.offset, nextOffset, text };
}
