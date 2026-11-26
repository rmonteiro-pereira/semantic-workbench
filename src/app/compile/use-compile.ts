// The states of the compile dialog and the steps between them. The steps are plain async functions over an injected client, so each state is tested without a browser.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckAnswer, SourceDescription } from '../../server/tessera/compile-service';
import type { CompileFinding } from '../../shared/tessera/compile-findings';
import type { LossReport } from '../../shared/tessera/loss-report';
import { compileApi, isCompileFailure, type CompileApi, type CompileFailure, type CompileSource } from './api';

/** The calls the compile dialog makes. */
export type CompileClient = Pick<CompileApi, 'check' | 'run' | 'download'>;

/** What the dialog shows. The status says which part of the screen is on. */
export type CompileView =
  | { status: 'loading'; step: 'checking' | 'accepting' | 'downloading' }
  | { status: 'unavailable'; reason: string }
  | { status: 'nothing-to-do'; commit: string; digest: string; base?: LossReport['base'] }
  | { status: 'refused'; source: SourceDescription; findings: CompileFinding[] }
  | { status: 'needs-acceptance'; commit: string; report: LossReport; notice?: string }
  | { status: 'ready'; commit: string; digest: string; base?: LossReport['base'] }
  | { status: 'released'; commit: string; digest: string }
  | { status: 'checked'; answer: CheckAnswer }
  | { status: 'error'; message: string };

/** The words shown when the project has nothing published to compile. */
export const NOT_PUBLISHED_REASON = 'This project has not been published yet, so there is nothing to compile. You can still check your working copy.';

/** The words shown when the published project moved while a download or acceptance was under way. */
export const SNAPSHOT_CHANGED_MESSAGE = 'The published project changed. Check it again to see the new report.';

/** The words shown when the report changed between the review and the acceptance. */
export const CHANGED_NOTICE = 'The project changed after you reviewed the report. Review the new report before you accept it.';

function unavailableReason(error: CompileFailure): string | null {
  if (error.status === 409 && error.body.error === 'not-published') return NOT_PUBLISHED_REASON;
  if (error.status === 403) return 'You do not have permission to export this project.';
  if (error.status === 404) return 'This project, or one of its files, could not be found or is not yours to read.';
  return null;
}

/** Turns a failed call into the state that explains it. A failure the interface cannot explain is an error with a retry. */
export function viewOfFailure(error: unknown): CompileView {
  if (isCompileFailure(error)) {
    const reason = unavailableReason(error);
    if (reason) return { status: 'unavailable', reason };
    if (error.status === 409 && error.body.error === 'snapshot-changed') return { status: 'error', message: SNAPSHOT_CHANGED_MESSAGE };
    if (error.status === 413) return { status: 'error', message: `This project is too large to compile: ${error.message}` };
  }
  return { status: 'error', message: (error as Error).message || 'The request failed.' };
}

function hasTesseraDocument(answer: CheckAnswer): boolean {
  return answer.files.some(file => file.treatment === 'compiled');
}

/** Reads the answer of a check of the published snapshot into the state the dialog shows. */
export function viewOfPublishedCheck(answer: CheckAnswer): CompileView {
  if (answer.source.kind !== 'published-snapshot') throw new Error('A published check must name a published snapshot.');
  const { commit } = answer.source;
  if (answer.result === 'refused') return { status: 'refused', source: answer.source, findings: answer.findings };
  if (answer.result === 'loss') return { status: 'needs-acceptance', commit, report: answer.report };
  if (!hasTesseraDocument(answer)) return { status: 'nothing-to-do', commit, digest: answer.report.digest, base: answer.report.base };
  return { status: 'ready', commit, digest: answer.report.digest, base: answer.report.base };
}

/** Reads the answer of a check of the working copy. It is never downloadable, so it keeps the label and offers nothing to accept. */
export function viewOfWorkingCheck(answer: CheckAnswer): CompileView {
  if (answer.result === 'refused') return { status: 'refused', source: answer.source, findings: answer.findings };
  return { status: 'checked', answer };
}

/** Checks the project from the chosen source. */
export async function startCheck(client: CompileClient, project: string, source: CompileSource): Promise<CompileView> {
  try {
    const answer = await client.check(project, source);
    return source === 'published' ? viewOfPublishedCheck(answer) : viewOfWorkingCheck(answer);
  } catch (error) {
    return viewOfFailure(error);
  }
}

/**
 * Accepts the report that is on screen. The digest sent is the one displayed, never a newer one: when the project changed, the server answers
 * with a different report and the person is shown that one instead of being asked again blindly.
 */
export async function acceptShownReport(client: CompileClient, project: string, shown: Extract<CompileView, { status: 'needs-acceptance' }>): Promise<CompileView> {
  try {
    const answer = await client.run(project, shown.report.digest, shown.commit);
    if (answer.result === 'released') return { status: 'released', commit: shown.commit, digest: shown.report.digest };
    if (answer.result === 'refused') return { status: 'refused', source: answer.source, findings: answer.findings };
    return { status: 'needs-acceptance', commit: shown.commit, report: answer.report, notice: CHANGED_NOTICE };
  } catch (error) {
    if (isCompileFailure(error) && error.status === 409 && error.body.error === 'snapshot-changed') {
      const fresh = await startCheck(client, project, 'published');
      return fresh.status === 'needs-acceptance' ? { ...fresh, notice: CHANGED_NOTICE } : fresh;
    }
    return viewOfFailure(error);
  }
}

/** The Ossie base a view's report names, when the view carries one. */
export function reportBaseOf(view: CompileView): LossReport['base'] | undefined {
  if (view.status === 'needs-acceptance') return view.report.base;
  if (view.status === 'checked') return view.answer.report?.base;
  if (view.status === 'ready' || view.status === 'nothing-to-do') return view.base;
  return undefined;
}

/** The last base a report named in this dialog, so the label stays after an accept or a reload of the view. */
export function useReportBase(view: CompileView): LossReport['base'] | undefined {
  const last = useRef<LossReport['base'] | undefined>(undefined);
  const current = reportBaseOf(view);
  if (current) last.current = current;
  return last.current;
}

/** The control the dialog gets from the hook. */
export type CompileControl = { view: CompileView; accept: () => void; retry: () => void; download: () => void };

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Runs the check when the dialog opens or the source changes, and exposes the accept, retry and download actions. */
export function useCompile(project: string, source: CompileSource, unavailableBecause: string | null, client: CompileClient = compileApi): CompileControl {
  const [view, setView] = useState<CompileView>({ status: 'loading', step: 'checking' });
  const generation = useRef(0);
  const run = useCallback(async (step: 'checking' | 'accepting' | 'downloading', work: () => Promise<CompileView>) => {
    const mine = ++generation.current;
    setView({ status: 'loading', step });
    const next = await work();
    if (mine === generation.current) setView(next);
  }, []);
  const check = useCallback(() => run('checking', () => startCheck(client, project, source)), [client, project, run, source]);
  useEffect(() => {
    if (unavailableBecause && source === 'published') setView({ status: 'unavailable', reason: unavailableBecause });
    else void check();
    return () => {
      generation.current += 1;
    };
  }, [check, source, unavailableBecause]);
  const accept = useCallback(() => {
    if (view.status === 'needs-acceptance') void run('accepting', () => acceptShownReport(client, project, view));
  }, [client, project, run, view]);
  const download = useCallback(() => {
    if (view.status !== 'ready' && view.status !== 'released' && view.status !== 'nothing-to-do') return;
    const { commit, digest } = view;
    void run('downloading', async () => {
      try {
        const file = await client.download(project, view.status === 'released' ? digest : undefined, commit);
        saveBlob(file.blob, file.fileName);
        return view;
      } catch (error) {
        return viewOfFailure(error);
      }
    });
  }, [client, project, run, view]);
  return { view, accept, retry: check, download };
}
