/** One attribute of a concept in the details panel. Other features add marks through the annotations slot and never edit this file. */
import React from 'react';
import './attributes.css';

/** What a row shows. The annotations slot sits after the text so a mark never pushes the name away. */
export type AttributeRowProps = {
  name: string;
  valueType: string;
  /** The sentence that reads the attribute, such as "Customer has email". */
  reading?: string;
  multiplicity?: string;
  description?: string;
  /** The concept that declares the attribute when the row is inherited. */
  inheritedFrom?: string;
  onOpenInheritedFrom?: (conceptName: string) => void;
  /** Marks from other features, for example a usage count or a change mark. */
  annotations?: React.ReactNode;
  /** Row actions such as move up, move down and edit. */
  actions?: React.ReactNode;
};

function InheritedMark({ concept, onOpen }: { concept: string; onOpen?: (conceptName: string) => void }) {
  const label = `Inherited from ${concept}`;
  if (!onOpen) return <span className="attribute-inherited">{label}</span>;
  return (
    <button type="button" className="link attribute-inherited" onClick={() => onOpen(concept)}>
      {label}
    </button>
  );
}

/** Renders one attribute with its type, reading and description, wrapping every text. */
export function AttributeRow({ name, valueType, reading, multiplicity, description, inheritedFrom, onOpenInheritedFrom, annotations, actions }: AttributeRowProps) {
  return (
    <li className="attribute-row">
      <div className="attribute-row-main">
        <span className="attribute-name">{name}</span>
        <span className="attribute-type">{valueType}</span>
        {multiplicity && <span className="attribute-multiplicity">{multiplicity}</span>}
        {inheritedFrom && <InheritedMark concept={inheritedFrom} onOpen={onOpenInheritedFrom} />}
      </div>
      {reading && <p className="attribute-reading">{reading}</p>}
      {description && <p className="attribute-description">{description}</p>}
      {(annotations || actions) && (
        <div className="attribute-row-extras">
          {annotations && <div className="attribute-annotations">{annotations}</div>}
          {actions && <div className="attribute-actions">{actions}</div>}
        </div>
      )}
    </li>
  );
}
