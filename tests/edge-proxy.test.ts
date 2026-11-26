import { describe, expect, test } from 'bun:test';
import { upstreamRequest } from '../scripts/edge-proxy';

const addresses = {
  publicOrigin: 'https://workbench.example.org',
  upstreamOrigin: 'http://127.0.0.1:4310',
};

function requestWith(headers: Record<string, string>, method = 'GET') {
  return new Request('http://10.0.0.5:4310/api/events?since=3', { method, headers });
}

describe('edge proxy', () => {
  test('re-addresses the public name and origin to loopback', () => {
    const forwarded = upstreamRequest(requestWith({ host: 'workbench.example.org', origin: 'https://workbench.example.org' }, 'POST'), addresses);
    expect(forwarded.url).toBe('http://127.0.0.1:4310/api/events?since=3');
    expect(forwarded.headers.get('host')).toBe('127.0.0.1:4310');
    expect(forwarded.headers.get('origin')).toBe('http://127.0.0.1:4310');
    expect(forwarded.method).toBe('POST');
  });

  test('passes any other host and origin unchanged so the Workbench refuses them', () => {
    const forwarded = upstreamRequest(requestWith({ host: 'attacker.example', origin: 'https://attacker.example' }), addresses);
    expect(forwarded.headers.get('host')).toBe('attacker.example');
    expect(forwarded.headers.get('origin')).toBe('https://attacker.example');
  });

  test('leaves a request without an origin without one', () => {
    const forwarded = upstreamRequest(requestWith({ host: 'workbench.example.org' }), addresses);
    expect(forwarded.headers.has('origin')).toBe(false);
  });
});
