/** The sections that sit under an item in the details panel: attributes, agent context and governance of a concept, a relationship or a metric. */
import React from 'react';
import { AgentContextSection } from '../agent-context/AgentContextSection';
import { AttributeList } from '../attributes/AttributeList';
import { ValueTypeUsage } from '../attributes/ValueTypeUsage';
import type { DetailsSection, SectionSupport } from '../edit/section-context';
import { GovernanceSection } from '../governance/GovernanceSection';
import type { Doc } from '../projects/api';
import type { ItemTarget } from './types';

type Props = {
  support: SectionSupport;
  target: ItemTarget;
  /** True while the Source tab holds changes that are not saved. */
  dirty: boolean;
  /** Selects the concept with this name, which an inherited attribute and a usage row link to. */
  openConcept: (name: string) => void;
  /** Starts the delete confirmation for a relationship of the concept. */
  removeRelationship: (target: ItemTarget) => void;
};

function sectionFor(support: SectionSupport, target: ItemTarget, dirty: boolean, openConcept: (name: string) => void): DetailsSection | null {
  const doc = support.projectDocsOf(target.docId).find((candidate: Doc) => candidate.id === target.docId);
  const document = support.documentOf(target.docId);
  if (!doc || !document) return null;
  return { doc, document, itemPath: target.path, projectDocs: support.projectDocsOf(target.docId), applySaved: support.applySaved, openConcept, dirty };
}

function namesOf(list: unknown, key: string, except: unknown): string[] {
  return (Array.isArray(list) ? list : []).map(item => item?.[key]).filter((name): name is string => typeof name === 'string' && name !== except);
}

/** Renders the sections for the kinds of item that have them, and nothing for the others. */
export function ItemSections({ support, target, dirty, openConcept, removeRelationship }: Props) {
  const section = sectionFor(support, target, dirty, openConcept);
  if (!section) return null;
  const item = target.path.reduce((node: any, key) => node?.[key], section.document);
  if (target.kind === 'concept') {
    const replacements = namesOf(section.document.ontology, 'concept', item?.concept);
    return (
      <>
        {item?.type === 'ValueType' && <ValueTypeUsage valueTypeName={String(item.concept)} concepts={section.document.ontology ?? []} onOpenConcept={openConcept} />}
        <AttributeList section={section} onRemove={index => removeRelationship({ docId: target.docId, path: [...target.path, 'relationships', index], kind: 'ontology-relationship' })} />
        <AgentContextSection section={section} />
        <GovernanceSection section={section} replacementChoices={replacements} />
      </>
    );
  }
  if (target.kind === 'ontology-relationship') {
    const siblings = target.path.slice(0, -2).reduce((node: any, key) => node?.[key], section.document);
    return (
      <>
        <AgentContextSection section={section} />
        <GovernanceSection section={section} replacementChoices={namesOf(siblings?.relationships, 'name', item?.name)} />
      </>
    );
  }
  if (target.kind === 'metric') {
    const model = target.path.slice(0, -2).reduce((node: any, key) => node?.[key], section.document);
    return <GovernanceSection section={section} metricPath={target.path} replacementChoices={namesOf(model?.metrics, 'name', item?.name)} />;
  }
  return null;
}
