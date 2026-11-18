/** Lists what a compile would drop, grouped by property, before the person accepts. The values themselves are never shown or stored. */
import React, { useState } from 'react';
import type { LossEntry, LossReport } from '../../shared/tessera/loss-report';
import './compile.css';

/** How many entries one group shows before the person asks for more. The report itself is always complete. */
export const ENTRIES_PER_STEP = 200;

/** Status counts appear in the report once governance statuses are part of it. */
type ReportWithStatuses = LossReport & { statusCounts?: Record<string, number> };

function pluralValues(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'value' : 'values'}`;
}

function documentsIn(losses: LossEntry[]): number {
  return new Set(losses.map(loss => loss.document)).size;
}

function groupByProperty(losses: LossEntry[]): [string, LossEntry[]][] {
  const groups = new Map<string, LossEntry[]>();
  for (const loss of losses) groups.set(loss.property, [...(groups.get(loss.property) ?? []), loss]);
  return [...groups.entries()].sort(([first], [second]) => (first < second ? -1 : 1));
}

function LossEntryRow({ loss }: { loss: LossEntry }) {
  return (
    <li className="loss-entry">
      <span className="loss-document">{loss.document}</span>
      <span className="loss-item">Item {loss.item}</span>
      <span className="loss-pointer">Place {loss.pointer}</span>
    </li>
  );
}

function LossGroup({ property, losses }: { property: string; losses: LossEntry[] }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(ENTRIES_PER_STEP);
  const visible = losses.slice(0, shown);
  return (
    <details className="loss-group" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>
        <span className="loss-property">{property}</span>
        <span className="loss-count">{pluralValues(losses.length)}</span>
      </summary>
      {open && (
        <>
          <p className="loss-explanation">Standard Ossie has no place for this property, so these values are not in the downloaded files.</p>
          <ul className="loss-list">
            {visible.map(loss => (
              <LossEntryRow key={`${loss.document}${loss.pointer}`} loss={loss} />
            ))}
          </ul>
          <p className="loss-shown">
            Showing {visible.length.toLocaleString('en-US')} of {losses.length.toLocaleString('en-US')}.
          </p>
          {visible.length < losses.length && (
            <button type="button" onClick={() => setShown(shown + ENTRIES_PER_STEP)}>
              Show {Math.min(ENTRIES_PER_STEP, losses.length - visible.length).toLocaleString('en-US')} more
            </button>
          )}
        </>
      )}
    </details>
  );
}

function StatusCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  return <p className="loss-statuses">Status of the dropped items: {entries.map(([status, count]) => `${status} ${count.toLocaleString('en-US')}`).join(', ')}.</p>;
}

/** The preview: counts first, one group per property, then the digest the acceptance is bound to. */
export function LossPreview({ report }: { report: ReportWithStatuses }) {
  const groups = groupByProperty(report.losses);
  if (!groups.length) {
    return (
      <section className="loss-preview" aria-label="What will be dropped">
        <p className="loss-summary">Nothing is dropped. The standard files hold everything in your project.</p>
      </section>
    );
  }
  return (
    <section className="loss-preview" aria-label="What will be dropped">
      <p className="loss-summary">
        <strong>{pluralValues(report.losses.length)} will be dropped</strong> from {documentsIn(report.losses).toLocaleString('en-US')} {documentsIn(report.losses) === 1 ? 'document' : 'documents'}.
        Your project is not changed; only the downloaded standard files leave them out.
      </p>
      {report.statusCounts && <StatusCounts counts={report.statusCounts} />}
      <div className="loss-groups">
        {groups.map(([property, losses]) => (
          <LossGroup key={property} property={property} losses={losses} />
        ))}
      </div>
      <div className="loss-digest">
        <span className="loss-digest-label">Report digest</span>
        <code className="loss-digest-value">{report.digest}</code>
      </div>
    </section>
  );
}
