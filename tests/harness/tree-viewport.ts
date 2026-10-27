import { observeTreeViewport } from '../../src/app/projects/tree-viewport';

const tree = document.querySelector<HTMLElement>('.project-tree');
if (!tree) throw new Error('The tree viewport harness needs a project tree.');
observeTreeViewport(tree);
const viewport = tree.closest('.documents')!.getBoundingClientRect();
const partialRows = [...tree.querySelectorAll('.project-file, .tree-row')].filter(row => {
  const bounds = row.getBoundingClientRect();
  return bounds.top < viewport.bottom - 1 && bounds.bottom > viewport.bottom + 1;
});
tree.dataset.initialPartialRows = String(partialRows.length);
