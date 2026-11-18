// A small synchronous SHA-256 for the browser. The compiler's digest module asks for Node's createHash, which a browser does not have, and the conversion preview runs the same compiler on one file so the person sees exactly what the server will write.

const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_STATE = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const BLOCK_BYTES = 64;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function messageSchedule(block: DataView): Uint32Array {
  const words = new Uint32Array(64);
  for (let index = 0; index < 16; index++) words[index] = block.getUint32(index * 4);
  for (let index = 16; index < 64; index++) {
    const previous = words[index - 15];
    const recent = words[index - 2];
    const small0 = rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3);
    const small1 = rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10);
    words[index] = (words[index - 16] + small0 + words[index - 7] + small1) | 0;
  }
  return words;
}

function compress(state: number[], block: DataView) {
  const words = messageSchedule(block);
  let [a, b, c, d, e, f, g, h] = state;
  for (let index = 0; index < 64; index++) {
    const big1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choice = (e & f) ^ (~e & g);
    const first = (h + big1 + choice + ROUND_CONSTANTS[index] + words[index]) | 0;
    const big0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const second = (big0 + majority) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + first) | 0;
    d = c;
    c = b;
    b = a;
    a = (first + second) | 0;
  }
  const next = [a, b, c, d, e, f, g, h];
  for (let index = 0; index < 8; index++) state[index] = (state[index] + next[index]) | 0;
}

/** The padded message: the bytes, a one bit, zeros, and the length in bits as a 64-bit number. */
function padded(bytes: Uint8Array): Uint8Array {
  const total = Math.ceil((bytes.length + 9) / BLOCK_BYTES) * BLOCK_BYTES;
  const message = new Uint8Array(total);
  message.set(bytes);
  message[bytes.length] = 0x80;
  const view = new DataView(message.buffer);
  view.setUint32(total - 8, Math.floor((bytes.length * 8) / 0x100000000));
  view.setUint32(total - 4, (bytes.length * 8) >>> 0);
  return message;
}

/** Returns the SHA-256 of the bytes as lowercase hexadecimal. */
export function hashBytes(bytes: Uint8Array): string {
  const state = [...INITIAL_STATE];
  const message = padded(bytes);
  const view = new DataView(message.buffer);
  for (let offset = 0; offset < message.length; offset += BLOCK_BYTES) compress(state, new DataView(message.buffer, view.byteOffset + offset, BLOCK_BYTES));
  return state.map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
}

/** The part of Node's createHash the digest module uses: one algorithm, updated once, read as hexadecimal. */
export function createHash(algorithm: string) {
  if (algorithm !== 'sha256') throw new Error(`The browser digest supports sha256 only, not ${algorithm}.`);
  const chunks: Uint8Array[] = [];
  const hash = {
    update(content: string | Uint8Array) {
      chunks.push(typeof content === 'string' ? new TextEncoder().encode(content) : content);
      return hash;
    },
    digest(encoding: 'hex') {
      if (encoding !== 'hex') throw new Error('The browser digest writes hexadecimal only.');
      const all = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }
      return hashBytes(all);
    },
  };
  return hash;
}
