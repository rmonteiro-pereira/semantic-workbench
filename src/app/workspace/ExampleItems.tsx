/** The example projects that the Add project menu can load. */
import { Layers, Network } from 'lucide-react';
import type { MenuItem } from '../projects/Menu';

type ExampleEntry = {
  id: string;
  title: string;
  detail: string;
  icon: 'layers' | 'network';
};

const exampleEntries: ExampleEntry[] = [
  {
    id: 'ubl',
    title: 'UBL business model',
    detail: '45 entities · 277 relationships',
    icon: 'layers',
  },
  {
    id: 'commerce',
    title: 'Commerce workspace',
    detail: 'ODCS · Ossie · OWL · SHACL · RDF',
    icon: 'layers',
  },
  {
    id: 'commerce-scale',
    title: 'Commerce scale data',
    detail: '1,000 entities · 5,000 relationships',
    icon: 'network',
  },
  {
    id: 'mapped-commerce',
    title: 'Mapped commerce',
    detail: 'Ontology → mappings → governed queries',
    icon: 'layers',
  },
  {
    id: 'flights',
    title: 'Ossie Flights',
    detail: 'Official ontology · semantic model · mappings',
    icon: 'network',
  },
  {
    id: 'billing',
    title: 'Subscription billing',
    detail: '36 business entities · 4 governed metrics',
    icon: 'layers',
  },
  {
    id: 'mall',
    title: 'Shopping center administration',
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

/** Lists one menu item per example; each loads its project. */
export function exampleMenuItems(props: Props): MenuItem[] {
  return exampleEntries.map(entry => toMenuItem(entry, props));
}
