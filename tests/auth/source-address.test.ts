// Which address a request is limited by, with and without trusted reverse proxies.
import { expect, test } from 'bun:test';
import { addressKey, clientAddress } from '../../src/server/auth/source-address';

test('with no trusted proxy the socket peer is the client and the header is ignored', () => {
  expect(clientAddress('10.0.0.9', '203.0.113.5', 0)).toBe('10.0.0.9');
  expect(clientAddress(undefined, '203.0.113.5', 0)).toBeUndefined();
});

test('with one trusted proxy the last entry is the client', () => {
  expect(clientAddress('10.0.0.9', '203.0.113.5', 1)).toBe('203.0.113.5');
});

test('entries the client wrote on the left are ignored', () => {
  const spoofed = '1.1.1.1, 2.2.2.2, 203.0.113.5';
  expect(clientAddress('10.0.0.9', spoofed, 1)).toBe('203.0.113.5');
  expect(clientAddress('10.0.0.9', '9.9.9.9, 203.0.113.5, 10.0.0.1', 2)).toBe('203.0.113.5');
});

test('a header that is too short or unparsable falls back to the peer', () => {
  expect(clientAddress('10.0.0.9', null, 1)).toBe('10.0.0.9');
  expect(clientAddress('10.0.0.9', '203.0.113.5', 2)).toBe('10.0.0.9');
  expect(clientAddress('10.0.0.9', 'not-an-address', 1)).toBe('10.0.0.9');
  expect(clientAddress('10.0.0.9', 'unknown', 1)).toBe('10.0.0.9');
});

test('a port or brackets on an entry are removed', () => {
  expect(clientAddress('10.0.0.9', '203.0.113.5:51234', 1)).toBe('203.0.113.5');
  expect(clientAddress('10.0.0.9', '[2001:db8:1:2:3:4:5:6]:443', 1)).toBe('2001:0db8:0001:0002::/64');
});

test('an IPv6 address counts as its /64 and a mapped IPv4 address as IPv4', () => {
  expect(addressKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:0db8:0001:0002::/64');
  expect(addressKey('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(addressKey('2001:db8:1:2:1:2:3:4'));
  expect(addressKey('2001:db8:1:3::1')).not.toBe(addressKey('2001:db8:1:2::1'));
  expect(addressKey('::1')).toBe('0000:0000:0000:0000::/64');
  expect(addressKey('::ffff:203.0.113.5')).toBe('203.0.113.5');
  expect(addressKey('203.0.113.5')).toBe('203.0.113.5');
});
