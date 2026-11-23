/** The Unpublished work entry of the graph toolbars' Show menu. */
import type { ShowItem } from '../graph/ShowMenu';
import { useItemDiffContext } from './ItemDiffContext';

/**
 * Marks items saved here but not yet published. It appears only where the comparison can run: a
 * project whose readers may see its history. The Comparison button next to the menu explains the
 * marks and lists the changes.
 */
export function useUnpublishedWorkShowItem(): ShowItem | null {
  const overlay = useItemDiffContext();
  if (!overlay || (overlay.project.actions && !overlay.project.actions.includes('history'))) return null;
  return {
    name: 'Unpublished work',
    summary: 'Mark items saved here that are not published yet',
    on: overlay.enabled,
    onToggle: () => overlay.setEnabled(!overlay.enabled),
  };
}
