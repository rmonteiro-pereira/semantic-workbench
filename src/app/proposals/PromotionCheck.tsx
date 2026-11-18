// Shows what a promotion check found: that publishing would work now, or each reason it would not,
// in plain sentences, with the files a content refusal names.
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { PromotionCheck as Result } from '../../shared/proposals/proposal';
import { REASON_TEXT } from './proposal-wording';

/** The outcome of a promotion check. */
export function PromotionCheck({ result }: { result: Result }) {
  if (result.ok) {
    return (
      <p role="status" className="scm-note proposal-check-ok">
        <CheckCircle2 size={14} />
        <span>Publishing would work now. Every project of the repository moves together.</span>
      </p>
    );
  }
  return (
    <div role="status" className="scm-note warning">
      <AlertTriangle size={14} />
      <div>
        <p className="proposal-reasons-title">Publishing would be refused:</p>
        <ul>
          {result.reasons.map(reason => (
            <li key={reason}>{REASON_TEXT[reason]}</li>
          ))}
        </ul>
        {result.files.length > 0 && (
          <>
            <p className="proposal-reasons-title">Files involved:</p>
            <ul>
              {result.files.map(file => (
                <li key={file}>
                  <code>{file}</code>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
