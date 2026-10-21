/** Presentation and event handling for status footer. */
import { CheckCircle2 } from 'lucide-react';
import React from 'react';
import type { Issue } from '../diagnostics';
import type { Entity, Relationship } from '../model';
import type { Doc } from '../projects/api';
import type { ValidatedModel } from './types';

type Props = {
  result: { model: ValidatedModel; error: string };
  source: string;
  current: Doc | null;
  setShowValidation: React.Dispatch<React.SetStateAction<boolean>>;
  validation:
    | {
        issues: Issue[];
        valid: boolean;
        model:
          | { kind: string; name: any; entities: Entity[]; edges: Relationship[]; issues: Issue[] }
          | {
              kind: string;
              layout: string | undefined;
              name: any;
              entities: Entity[];
              edges: Relationship[];
              issues: Issue[];
              document: any;
            };
      }
    | { issues: Issue[]; valid: boolean; model: null };
  model: ValidatedModel;
  message: string;
  tab: string;
};
/** Renders status footer. */
export function StatusFooter({
  result,
  source,
  current,
  setShowValidation,
  validation,
  model,
  message,
  tab,
}: Props) {
  function getValidationStatus() {
    if (result.error) {
      return 'Validation failed';
    }
    if (source) {
      return 'Structure checked';
    }
    return 'Ready to import';
  }

  return (
    <>
      <footer>
        <span>
          <CheckCircle2 size={14} />
          {getValidationStatus()}
          {(source || current) && (
            <button className="validation-toggle" onClick={() => setShowValidation(v => !v)}>
              Validation details{validation.issues.length ? ` (${validation.issues.length})` : ''}
            </button>
          )}
          {current && source !== current.source ? ' · Not saved to file yet' : ''}
        </span>
        <span>
          {model?.entities.length ?? 0} entities · {model?.edges.length ?? 0} relationships
        </span>
      </footer>
      {(message || (result.error && tab !== 'scm')) && (
        <div role="status" className={`status ${result.error && tab !== 'scm' ? 'error' : ''}`}>
          {result.error && tab !== 'scm'
            ? 'Validation failed. Review the findings and repair in Source.'
            : message}
        </div>
      )}
    </>
  );
}
