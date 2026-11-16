/** Exercises canonical spelling and segment operations over reproducible hostile names. */
import { expect, test } from 'bun:test';
import { formatAddress, parseAddress, replacePrefix, resolveAddress, type Address } from '../src/shared/core/item-address';
import { hostileName, withAddressSeed } from './helpers/seeded-random';

test('generated locators round trip injectively and reject noncanonical mutations', () => {
  withAddressSeed(random => {
    const seen = new Map<string, string>();
    for (let index = 0; index < 10_000; index++) {
      const name = hostileName(random);
      const address: Address = { grammar: 1, form: 'absolute', project: 'project', document: ['a.yaml'], chain: [{ kind: 'concept', name }] };
      const text = formatAddress(address);
      expect(parseAddress(text)).toEqual({ ok: true, address });
      const result = parseAddress(text);
      if (!result.ok) throw new Error(result.reason);
      expect(formatAddress(result.address)).toBe(text);
      if (seen.has(text)) expect(seen.get(text)).toBe(name);
      seen.set(text, name);
      expect(parseAddress(text.replace('project', '%70roject')).ok).toBe(false);
      expect(parseAddress(text + '/').ok).toBe(false);
      const target: Address = { ...address, chain: [{ kind: 'concept', name: 'target' }] };
      const child: Address = { ...address, chain: [...address.chain, { kind: 'relationship', name: 'suffix' }], snapshot: 'opaque-v1' };
      expect(replacePrefix(child, address, target)).toEqual({ ...child, chain: [...target.chain, child.chain[1]] });
      expect(resolveAddress({ grammar: 1, form: 'document-relative', chain: address.chain }, address)).toEqual({ ok: true, address });
    }
  });
});
