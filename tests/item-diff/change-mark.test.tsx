import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChangeMark } from '../../src/app/item-diff/ChangeMark';

test('every unpublished mark has a text label and a dashed boundary', () => {
  for (const change of ['added', 'changed', 'removed'] as const) {
    const mark = renderToStaticMarkup(<ChangeMark change={change} />);
    expect(mark).toContain('item-change-dashed');
    expect(mark).toContain(`>Not published: ${change}</span>`);
  }
  expect(renderToStaticMarkup(<ChangeMark />)).toBe('');
});
