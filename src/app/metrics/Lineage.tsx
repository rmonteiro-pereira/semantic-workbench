/** Traces metric inputs to physical sources and declared contract quality rules without running
 * them. */
import React from 'react';
import { ArrowRight, Database, FileCheck2, Gauge, Table2 } from 'lucide-react';
import type { KpiExplanation, Trust } from '../../server/agent/explain';
// Physical names link metric input fields to contract objects and properties. Quality rules and
// service levels are displayed as declared, never checked here.
const slaText = (s: Trust) => `${s.property}${s.value !== undefined ? ` ${s.value}` : ''}${s.unit ? ` ${s.unit}` : ''}`;
/** Displays metric inputs and their declared dataset and contract sources. */
export function Lineage({ explanation: e }: { explanation: KpiExplanation }) {
  const declared = e.inputs.some(i => i.sla.length || i.fields.some(f => f.odcs.some(o => o.quality.length)));
  return (
    <section className="kpi-lineage" aria-labelledby="kpi-lineage">
      <h3 id="kpi-lineage">Where the data comes from</h3>
      <p className="lineage-intro">
        From each input metric to the fields it reads, the dataset behind them and the data contract that governs that table.
        {declared && ' Quality rules and service levels are as declared in the contract; the workbench does not run them.'}
      </p>
      <div className="lineage-head" aria-hidden="true">
        <span>Input metric</span>
        <span>Fields</span>
        <span>Dataset</span>
        <span>Data contract (ODCS)</span>
      </div>
      {e.inputs.map(input => (
        <div className="lineage-row" key={input.metric} role="group" aria-label={`Lineage of ${input.label}`}>
          <div className="lineage-cell metric" data-step="Input metric">
            <Gauge size={15} />
            <div>
              <strong>{input.label}</strong>
              <small>
                {input.aggregation ?? 'Expression'} · <code>{input.metric}</code>
              </small>
            </div>
            <ArrowRight className="lineage-arrow" size={14} />
          </div>
          <div className="lineage-cell fields" data-step="Fields">
            {input.fields.map(f => (
              <div key={f.dataset + f.field} className="lineage-field">
                <code>
                  {f.dataset}.{f.field}
                </code>
                {f.expression !== f.field && <small>= {f.expression}</small>}
              </div>
            ))}
            {!input.fields.length && <span className="muted">No field reference</span>}
            <ArrowRight className="lineage-arrow" size={14} />
          </div>
          <div className="lineage-cell dataset" data-step="Dataset">
            {input.datasets.map(d => (
              <div key={d.name}>
                <Table2 size={14} />
                <div>
                  <strong>{d.name}</strong>
                  <small>
                    source <code>{d.source || '—'}</code>
                  </small>
                </div>
              </div>
            ))}
            <ArrowRight className="lineage-arrow" size={14} />
          </div>
          <div className="lineage-cell odcs" data-step="Data contract (ODCS)">
            {(() => {
              const links = input.fields.flatMap(f => f.odcs);
              if (!links.length)
                return (
                  <span className="muted">
                    <Database size={14} /> No data contract declares this source.
                  </span>
                );
              const byObject = new Map<string, typeof links>();
              for (const l of links) {
                const k = l.file + '#' + l.object;
                byObject.set(k, [...(byObject.get(k) ?? []), l]);
              }
              return [...byObject.values()].map(group => {
                const first = group[0];
                const objectQuality = group.flatMap(l => l.quality).filter((q, i, a) => a.findIndex(x => x.name === q.name) === i);
                return (
                  <div key={first.file + first.object} className="odcs-object">
                    <div className="odcs-title">
                      <FileCheck2 size={14} />
                      <strong>{first.object}</strong>
                      <small>
                        {first.contract} · <code>{first.file}</code>
                      </small>
                    </div>
                    <div className="chip-row">
                      {group
                        .filter(l => l.property)
                        .map(l => (
                          <span key={l.property} className="odcs-property">
                            <code>{l.property}</code>
                            {l.logicalType && <small>{l.logicalType}</small>}
                          </span>
                        ))}
                    </div>
                    {objectQuality.length > 0 && (
                      <ul className="trust-list">
                        {objectQuality.map(q => (
                          <li key={q.name} className={`trust quality severity-${q.severity ?? 'info'}`} title={q.description}>
                            <span>{q.dimension ?? 'quality'}</span>
                            {q.description ?? q.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              });
            })()}
            {input.sla.length > 0 && (
              <div className="chip-row sla">
                {input.sla.map(s => (
                  <span key={slaText(s)} className="trust sla" title={s.element ? `Applies to ${s.element}` : 'Applies to the whole contract'}>
                    SLA · {slaText(s)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
