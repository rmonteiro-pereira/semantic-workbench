/** Words for what the status footer counts, which depend on the kind of document. */

function noun(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Says what the open document holds: concept mappings, or entities and relationships. */
export function footerCounts(kind: string | undefined, entities: number, relationships: number) {
  if (kind === 'Ossie mappings') return noun(entities, 'concept mapping', 'concept mappings');
  const entityText = noun(entities, 'entity', 'entities');
  return `${entityText} · ${noun(relationships, 'relationship', 'relationships')}`;
}
