/** Defines the built-in Ossie concepts from the pinned ontology schema. */
// Apache Ossie ontology.md, Built-in concepts (pinned schema commit in schemas/README.md).
export const OSSIE_BUILTINS = new Set([
  'Any',
  'Boolean',
  'Date',
  'DateTime',
  'Decimal',
  'Float',
  'Integer',
  'String',
]);
/** Constructs the model representation of a built-in Ossie concept. */
export const builtinConcept = (name: string) => ({
  concept: name,
  type: name === 'Any' ? 'EntityType' : 'ValueType',
  description: `Implicit Apache Ossie built-in ${name} concept.`,
  builtin: true,
});
