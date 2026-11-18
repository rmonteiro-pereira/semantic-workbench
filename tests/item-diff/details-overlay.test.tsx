import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttributeRow } from '../../src/app/attributes/AttributeRow';
import { ChangeMark } from '../../src/app/item-diff/ChangeMark';
import { itemAddress, ItemChangeAnnotation } from '../../src/app/item-diff/ItemChangeAnnotation';
import { parseAddress } from '../../src/shared/core/item-address';

test('details and catalog qualify structured locators and remain untouched without an overlay', () => {
  const doc = { project: 'sales', path: 'definitions.ontology.yaml' };
  for (const suffix of ['concept:Customer', 'concept:Customer/relationship:Owns']) {
    const input = parseAddress(`sw1:#ontology:Sales/${suffix}`);
    if (!input.ok) throw new Error('Invalid test address: ' + input.reason);
    expect(itemAddress(doc, input.address)).toBe(`sw1:sales/definitions.ontology.yaml#ontology:Sales/${suffix}`);
    expect(renderToStaticMarkup(<ItemChangeAnnotation document={doc} item={{ address: input.address }} />)).toBe('');
  }
});

test('an attribute passes the unpublished change through its existing annotation slot', () => {
  const row = renderToStaticMarkup(<AttributeRow name="Email" valueType="String" annotations={<ChangeMark change="changed" />} />);
  expect(row).toContain('Email');
  expect(row).toContain('attribute-annotations');
  expect(row).toContain('Not published: changed');
  expect(renderToStaticMarkup(<AttributeRow name="Email" valueType="String" />)).not.toContain('attribute-annotations');
});
