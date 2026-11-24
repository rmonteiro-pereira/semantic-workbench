import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BranchPicker } from '../../src/app/scm/BranchPicker';

const onSwitch = () => {};

test('the ordinary branch picker keeps its create button and the item entry opens the same form', () => {
  const ordinary = renderToStaticMarkup(<BranchPicker project="sales" current="main" version={0} disabled={false} onSwitch={onSwitch} />);
  expect(ordinary).toContain('New branch');
  expect(ordinary).not.toContain('New branch name');
  const suggested = renderToStaticMarkup(<BranchPicker project="sales" current="main" version={0} disabled={false} initialCreateName="item/customer" onSwitch={onSwitch} />);
  expect(suggested).toContain('New branch name');
  expect(suggested).toContain('value="item/customer"');
  expect(suggested).toContain('>Create</button>');
});
