// The logout form's body is bounded before it is read, whatever the caller declares.
import { expect, test } from 'bun:test';
import { validCsrf } from '../../src/server/auth/csrf';

const origin = 'https://workbench.example';
const formHeaders = {
  Origin: origin,
  'Content-Type': 'application/x-www-form-urlencoded',
};

/** A body that records how many chunks the reader pulled from it. */
function countedBody(chunkBytes: number, chunks: number) {
  const pulled = { chunks: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled.chunks >= chunks) {
        controller.close();
        return;
      }
      pulled.chunks++;
      controller.enqueue(new TextEncoder().encode('a'.repeat(chunkBytes)));
    },
  });
  return { body, pulled };
}

function logout(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(origin + '/auth/logout', {
    method: 'POST',
    headers: { ...formHeaders, ...headers },
    body,
    // @ts-expect-error Bun needs this to stream a request body without buffering it.
    duplex: 'half',
  });
}

test('a body that declares more than 4096 bytes is refused without being read', async () => {
  const { body, pulled } = countedBody(1000, 10);
  const request = logout(body, { 'Content-Length': '10000' });
  expect(await validCsrf(request, origin, 'secret')).toBe(false);
  // The stream pulls once when it is created; any further pull means the body was read.
  expect(pulled.chunks).toBeLessThanOrEqual(1);
});

test('a body that declares nothing is cut off once it passes 4096 bytes', async () => {
  const { body, pulled } = countedBody(1000, 1000);
  expect(await validCsrf(logout(body), origin, 'secret')).toBe(false);
  expect(pulled.chunks).toBeLessThan(20);
});

test('a small form with the right token is accepted, with or without a declared length', async () => {
  const form = new URLSearchParams({ csrf: 'secret' }).toString();
  expect(await validCsrf(logout(form), origin, 'secret')).toBe(true);
  const declared = logout(form, { 'Content-Length': String(form.length) });
  expect(await validCsrf(declared, origin, 'secret')).toBe(true);
  const wrong = new URLSearchParams({ csrf: 'nope' }).toString();
  expect(await validCsrf(logout(wrong), origin, 'secret')).toBe(false);
});

test('a form of exactly 4096 bytes is read and a token past it is not honoured', async () => {
  const padding = 'p='.padEnd(4096 - '&csrf=secret'.length, 'x');
  const exact = padding + '&csrf=secret';
  expect(exact.length).toBe(4096);
  expect(await validCsrf(logout(exact), origin, 'secret')).toBe(true);
  expect(await validCsrf(logout(exact + 'x'), origin, 'secret')).toBe(false);
});
