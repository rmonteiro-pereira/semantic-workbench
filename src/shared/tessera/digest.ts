// SHA-256 of text or bytes, written as lowercase hexadecimal, for loss reports and manifests.
import { createHash } from 'node:crypto';

/** Returns the SHA-256 of a string (as UTF-8) or of bytes. */
export function sha256Hex(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}
