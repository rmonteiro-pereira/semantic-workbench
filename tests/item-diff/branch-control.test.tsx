import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BranchControl, suggestedItemBranch } from '../../src/app/item-diff/BranchControl';
import { ItemDiffProvider } from '../../src/app/item-diff/ItemDiffContext';
import type { ProjectInfo } from '../../src/app/projects/api';

const project: ProjectInfo = {
  slug: 'sales',
  name: 'Sales',
  branch: 'main',
  origin: '',
  repo: 'sales',
  folder: '',
  changes: 0,
  behind: 0,
  ahead: 0,
  files: [],
};
const refreshBranch = () => {};

function markup(actions?: string[], dirty?: boolean) {
  return renderToStaticMarkup(
    <ItemDiffProvider project={{ ...project, actions }} docs={[]} revision={0} refreshBranch={refreshBranch}>
      <BranchControl name="Àccount balance" dirty={dirty} />
    </ItemDiffProvider>,
  );
}

test('the inspector shows every reader their branch and lets only editors create one', () => {
  expect(markup(['read', 'history'])).toContain('Current branch: main');
  expect(markup(['read', 'history'])).not.toContain('Start a branch');
  expect(markup(['edit', 'branch'])).toContain('Start a branch for this item');
  expect(markup(undefined, true)).toContain('Save or discard Source changes before switching branches.');
});

test('the branch suggestion normalizes a user-facing item name', () => {
  expect(suggestedItemBranch('Àccount balance')).toBe('item/account-balance');
  expect(suggestedItemBranch('?!')).toBe('item/definition');
});
