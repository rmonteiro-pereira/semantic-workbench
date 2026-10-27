/** The sidebar's Examples button and the fly-out menu that loads one example project. */
import './ExampleMenu.css';
import { ChevronRight, ChevronUp, Layers, Network } from 'lucide-react';
import type { MenuItem } from '../projects/Menu';
import { MenuButton } from '../projects/Menu';

type ExampleEntry = {
  id: string;
  title: string;
  detail: string;
  icon: 'layers' | 'network';
};

const exampleEntries: ExampleEntry[] = [
  {
    id: 'ubl',
    title: 'Load UBL business model',
    detail: '45 entities · 277 relationships',
    icon: 'layers',
  },
  {
    id: 'commerce',
    title: 'Load commerce workspace',
    detail: 'ODCS · Ossie · OWL · SHACL · RDF',
    icon: 'layers',
  },
  {
    id: 'commerce-scale',
    title: 'Load commerce scale data',
    detail: '1,000 entities · 5,000 relationships',
    icon: 'network',
  },
  {
    id: 'mapped-commerce',
    title: 'Load mapped commerce',
    detail: 'Ontology → mappings → governed queries',
    icon: 'layers',
  },
  {
    id: 'flights',
    title: 'Load Ossie Flights',
    detail: 'Official ontology · semantic model · mappings',
    icon: 'network',
  },
  {
    id: 'billing',
    title: 'Load subscription billing',
    detail: '36 business entities · 4 governed metrics',
    icon: 'layers',
  },
  {
    id: 'mall',
    title: 'Load shopping center administration',
    detail: '145 entity types · 11 namespaces · 25 metrics',
    icon: 'layers',
  },
];

type Props = {
  loadExample: (id: string) => Promise<void>;
  busy: boolean;
};

function renderIcon(icon: ExampleEntry['icon']) {
  if (icon === 'network') {
    return <Network size={16} />;
  }
  return <Layers size={16} />;
}

function toMenuItem(entry: ExampleEntry, props: Props): MenuItem {
  return {
    label: entry.title,
    detail: entry.detail,
    icon: renderIcon(entry.icon),
    disabled: props.busy && 'Another example is loading',
    run: () => void props.loadExample(entry.id),
  };
}

/** Renders the Examples button; its menu opens against the button, or upward on a phone. */
export function ExampleMenu(props: Props) {
  return (
    <MenuButton
      ariaLabel="Examples"
      label={
        <>
          Examples
          <ChevronRight className="flyout-arrow-side" size={14} aria-hidden="true" />
          <ChevronUp className="flyout-arrow-up" size={14} aria-hidden="true" />
        </>
      }
      icon={<Layers size={16} />}
      className="examples-menu"
      buttonClassName="import"
      align="start"
      placement="above"
      matchButtonWidth
      flyoutBesideSidebar
      items={exampleEntries.map(entry => toMenuItem(entry, props))}
    />
  );
}
