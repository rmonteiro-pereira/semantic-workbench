/** Runs a SHACL shapes file against another RDF file of the same project and lists what the data breaks. */
import { useEffect, useRef, useState } from 'react';
import type { Doc } from '../projects/api';
import { rdfSyntax } from '../../shared/validation/rdf';
import type { ShaclReport } from '../../shared/validation/shacl';
import { runShaclInWorker } from './shacl-run';
import './shacl-check.css';

type Props = {
  shapes: Doc;
  /** The shapes' own text, which may be newer than the saved file. */
  shapesSource: string;
  projectDocs: Doc[];
};

type CheckState = { status: 'idle' } | { status: 'running' } | { status: 'done'; report: ShaclReport } | { status: 'failed'; message: string };

/** Lists the RDF files of the shapes' project that the shapes could be run against. */
export function dataFilesFor(shapes: Doc, projectDocs: Doc[]): Doc[] {
  return projectDocs
    .filter(doc => doc.project === shapes.project && doc.id !== shapes.id && rdfSyntax(doc.source, doc.filename) !== null)
    .sort((first, second) => first.filename.localeCompare(second.filename));
}

function noun(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Lets the user pick a data file and runs the shapes against it. */
export function ShaclCheck({ shapes, shapesSource, projectDocs }: Props) {
  const dataFiles = dataFilesFor(shapes, projectDocs);
  const [dataId, setDataId] = useState(dataFiles[0]?.id ?? '');
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const data = dataFiles.find(doc => doc.id === dataId) ?? dataFiles[0];

  // Each run gets a number. A run that finishes after the files changed, or after a newer run began, is dropped.
  const latestRun = useRef(0);

  // A result describes the text it ran on, so it is dropped as soon as either file changes.
  useEffect(() => {
    latestRun.current += 1;
    setCheck({ status: 'idle' });
  }, [shapesSource, data?.id, data?.source]);

  async function run() {
    if (!data) return;
    latestRun.current += 1;
    const thisRun = latestRun.current;
    setCheck({ status: 'running' });
    try {
      const report = await runShaclInWorker({ filename: shapes.filename, source: shapesSource }, { filename: data.filename, source: data.source });
      if (thisRun === latestRun.current) setCheck({ status: 'done', report });
    } catch (error) {
      if (thisRun === latestRun.current) setCheck({ status: 'failed', message: (error as Error).message });
    }
  }

  if (!data) {
    return (
      <section className="shacl-check" aria-label="Check shapes against data">
        <h3>Check these shapes against data</h3>
        <p>Add a Turtle, N-Triples or N3 data file to this project to run the shapes against it.</p>
      </section>
    );
  }
  return (
    <section className="shacl-check" aria-label="Check shapes against data">
      <h3>Check these shapes against data</h3>
      <label>
        Data file
        <select value={data.id} onChange={event => setDataId(event.target.value)}>
          {dataFiles.map(doc => (
            <option key={doc.id} value={doc.id}>
              {doc.filename}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={run} disabled={check.status === 'running'}>
        {check.status === 'running' ? 'Running…' : `Run shapes on ${data.filename}`}
      </button>
      <ShaclResult check={check} dataFilename={data.filename} />
    </section>
  );
}

function ShaclResult({ check, dataFilename }: { check: CheckState; dataFilename: string }) {
  if (check.status === 'failed')
    return (
      <p role="alert" className="shacl-status bad">
        {check.message}
      </p>
    );
  if (check.status !== 'done') return null;
  const { findings } = check.report;
  if (!findings.length) {
    return (
      <p role="status" className="shacl-status ok">
        <strong>No problems in {dataFilename}</strong> Every shape ran, including SPARQL constraints.
      </p>
    );
  }
  return (
    <div role="status">
      <p className="shacl-status bad">
        <strong>{noun(findings.length, 'problem', 'problems')} in the data</strong> Every shape ran, including SPARQL constraints.
      </p>
      <ul className="shacl-findings">
        {findings.map((finding, index) => (
          <li key={index} className={finding.severity}>
            <span>
              {finding.focusLabel}: {finding.message}
            </span>
            <code>
              {finding.shape} · {finding.rule}
            </code>
            <code>{finding.focusNode}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
