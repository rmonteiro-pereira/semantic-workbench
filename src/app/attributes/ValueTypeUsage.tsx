/** On a value type's details: the attributes that use it across the document, each with a link to its concept. */
import React from 'react';
import { conceptKindLookup, declaredAttributesOf, type ConceptShape } from '../../shared/attributes/attribute-rule';
import './attributes.css';

type Props = {
  valueTypeName: string;
  concepts: readonly ConceptShape[];
  onOpenConcept?: (conceptName: string) => void;
};

/** The attributes of the document that hold the value type, as concept and attribute names. */
export function attributesUsing(valueTypeName: string, concepts: readonly ConceptShape[]): { concept: string; attribute: string }[] {
  const lookup = conceptKindLookup(concepts);
  return concepts.flatMap(concept =>
    declaredAttributesOf(concept, lookup)
      .filter(entry => entry.valueType === valueTypeName)
      .map(entry => ({ concept: String(concept.concept), attribute: entry.name })),
  );
}

/** Renders the usage list of one value type. */
export function ValueTypeUsage({ valueTypeName, concepts, onOpenConcept }: Props) {
  const used = attributesUsing(valueTypeName, concepts);
  return (
    <section className="attribute-section" aria-label="Attributes that use this type">
      <div className="section-label">ATTRIBUTES THAT USE THIS TYPE</div>
      {used.length === 0 && <p className="hint">No attribute uses {valueTypeName} yet.</p>}
      <ul className="attribute-list">
        {used.map(({ concept, attribute }) => (
          <li key={`${concept}/${attribute}`} className="attribute-row">
            <span className="attribute-name">{attribute}</span>
            <span className="attribute-type">
              of{' '}
              {onOpenConcept ? (
                <button type="button" className="link" onClick={() => onOpenConcept(concept)}>
                  {concept}
                </button>
              ) : (
                concept
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
