/** The sidebar's Add project button: import files, clone a repository or load an example. */
import { ChevronDown, GitBranch, Layers, Plus, Upload } from 'lucide-react';
import type { MenuItem } from '../projects/Menu';
import { MenuButton } from '../projects/Menu';
import { exampleMenuItems } from './ExampleItems';

type Props = {
  onImport: () => void;
  onClone: () => void;
  loadExample: (id: string) => Promise<void>;
  busy: boolean;
};

/** Renders the one button that starts every new project, as wide as the sidebar. */
export function AddProjectMenu({ onImport, onClone, loadExample, busy }: Props) {
  const items: MenuItem[] = [
    { label: 'Import files', icon: <Upload size={16} />, run: onImport },
    { label: 'Clone a repository', icon: <GitBranch size={16} />, run: onClone },
    {
      label: 'Load an example',
      icon: <Layers size={16} />,
      separatorBefore: true,
      submenu: exampleMenuItems({ loadExample, busy }),
      run: () => {},
    },
  ];
  return (
    <MenuButton
      ariaLabel="Add project"
      label={
        <>
          Add project
          <ChevronDown className="add-project-arrow" size={14} aria-hidden="true" />
        </>
      }
      icon={<Plus size={16} />}
      className="add-project-menu"
      buttonClassName="primary add-project"
      align="start"
      matchButtonWidth
      items={items}
    />
  );
}
