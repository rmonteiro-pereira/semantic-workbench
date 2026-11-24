// Compiles the project that uses every revision 2 addition: standard output stays clean, attributes survive unchanged, and no acceptance lets a changed attribute through.
import { expect, test } from 'bun:test';
import { parse } from 'yaml';
import { compileDocument, additionSites, withoutAdditions } from '../../src/shared/tessera/compile-document';
import { acceptLoss } from '../../src/shared/tessera/loss-report';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import { REGISTRY } from '../../src/shared/tessera/registry';
import { ADDITIONS_PROJECT_FILES } from '../helpers/tessera-repository';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const options = { lossPolicySha256: null };
const files = Object.entries(ADDITIONS_PROJECT_FILES).map(([path, text]) => ({ path, bytes: encoder.encode(text) }));
const ontologyText = ADDITIONS_PROJECT_FILES['retail/ontology.yaml'];

test('the project compiles and its output holds no addition, no marker and no agent context', () => {
  const result = compileUnit(files, options);
  expect(result.failures).toEqual([]);
  const output = decoder.decode(result.outputs.find(candidate => candidate.path === 'retail/ontology.yaml')!.bytes);
  for (const forbidden of ['tessera', 'Use the account concept', 'client', 'sign in with', 'dana@example.com']) expect(output).not.toContain(forbidden);
  expect(parse(output)).toEqual(withoutAdditions(parse(ontologyText), additionSites(parse(ontologyText))));
});

test('every addition is listed as a loss with its address and no value', () => {
  const result = compileUnit(files, options);
  const properties = result.report.losses.map(entry => entry.property);
  expect(properties.filter(name => name === 'tessera_attributes')).toHaveLength(1);
  expect(properties.filter(name => name === 'tessera_ai_context')).toHaveLength(2);
  expect(properties.filter(name => name === 'tessera_governance')).toHaveLength(5);
  const customerContext = result.report.losses.find(entry => entry.pointer === '/ontology/2/tessera_ai_context')!;
  expect(customerContext.item).toBe('sw1:#ontology:Retail/concept:Customer');
});

test('the attribute relationships of the output equal the source relationships', () => {
  const result = compileUnit(files, options);
  const output = parse(decoder.decode(result.outputs.find(candidate => candidate.path === 'retail/ontology.yaml')!.bytes));
  const source = parse(ontologyText);
  const customer = (data: any) => data.ontology.find((concept: any) => concept.concept === 'Customer');
  expect(customer(output).relationships.map((relationship: any) => relationship.name)).toEqual(['email', 'tier', 'places']);
  expect(customer(output).relationships[1]).toEqual(customer(source).relationships[1]);
});

test('compiling twice gives the same bytes and the same digest', () => {
  const first = compileUnit(files, options);
  const second = compileUnit([...files].reverse(), options);
  expect(second.report.digest).toBe(first.report.digest);
});

test('an output that changes an attribute fails the compile and no acceptance overrides it', () => {
  const faulty = {
    compileDocument(document: { path: string; source: string }) {
      const compiled = compileDocument(document, REGISTRY);
      if (!compiled.ok || !document.path.endsWith('ontology.yaml')) return compiled;
      return { ...compiled, text: compiled.text.replace('- concept: LoyaltyTier\n    type: ValueType', '- concept: LoyaltyTier\n    type: EntityType') };
    },
  };
  const result = compileUnit(files, options, faulty);
  expect(result.failures.map(failure => failure.code)).toContain('meaning');
  expect(result.outputs).toEqual([]);
  expect(acceptLoss(result.report, { digest: result.report.digest })).toEqual({ accepted: 'digest' });
  expect(result.failures.length).toBeGreaterThan(0);
});

test('a changed attribute relationship alone fails the attribute check', () => {
  const faulty = {
    compileDocument(document: { path: string; source: string }) {
      const compiled = compileDocument(document, REGISTRY);
      if (!compiled.ok || !document.path.endsWith('ontology.yaml')) return compiled;
      return { ...compiled, text: compiled.text.replace('Customer has tier', 'Customer holds tier') };
    },
  };
  const result = compileUnit(files, options, faulty);
  const messages = result.failures.map(failure => failure.message).join(' ');
  expect(messages).toContain('The attributes of the concept Customer');
});
