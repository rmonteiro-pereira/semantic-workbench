/** Presentation and event handling for status footer. */
import { CheckCircle2 } from 'lucide-react';
import React from 'react';
import { footerCounts } from './footerCounts';
type Props = {
  error: string;
  hasSource: boolean;
  hasDocument: boolean;
  dirty: boolean;
  setShowValidation: React.Dispatch<React.SetStateAction<boolean>>;
  issueCount: number;
  kind?: string;
  entityCount: number;
  relationshipCount: number;
  message: string;
  tab: string;
};
/** Renders status footer. */
export const StatusFooter = React.memo(function StatusFooter({
  error,
  hasSource,
  hasDocument,
  dirty,
  setShowValidation,
  issueCount,
  kind,
  entityCount,
  relationshipCount,
  message,
  tab,
}: Props) {
  function getValidationStatus() {
    if (error) {
      return 'Validation failed';
    }
    if (hasSource) {
      return 'Structure checked';
    }
    return 'Ready to import';
  }

  // A refused or failed save is a warning, not a success: it has the colours of a failure.
  const showsWarning = Boolean(error && tab !== 'scm') || message.startsWith('Not saved');
  return (
    <>
      <footer>
        <span>
          <CheckCircle2 size={14} />
          {getValidationStatus()}
          {(hasSource || hasDocument) && (
            <button className="validation-toggle" onClick={() => setShowValidation(v => !v)}>
              Validation details{issueCount ? ` (${issueCount})` : ''}
            </button>
          )}
          {dirty ? ' · Not saved to file yet' : ''}
        </span>
        <span>{footerCounts(kind, entityCount, relationshipCount)}</span>
      </footer>
      {(message || (error && tab !== 'scm')) && (
        <div role="status" className={`status ${showsWarning ? 'error' : ''}`}>
          {error && tab !== 'scm'
            ? 'Validation failed. Review the findings and repair in Source.'
            : message}
        </div>
      )}
    </>
  );
});
