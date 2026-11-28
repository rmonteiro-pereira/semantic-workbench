// The states of the conversion dialog and the steps between them: review what the conversion would do, then confirm it. The steps are plain async functions over an injected client.
import { useCallback, useEffect, useRef, useState } from 'react';
import { compileDocument } from '../../shared/tessera/compile-document';
import type { CompileFinding } from '../../shared/tessera/compile-findings';
import type { LossReport } from '../../shared/tessera/loss-report';
import { REGISTRY } from '../../shared/tessera/registry';
import { BaseConversionRefusal, convertToDraftBase, type BaseConversionChange } from '../../shared/tessera/base-conversion';
import { api } from '../projects/api';
import { compileApi, isCompileFailure, type CompileApi, type ConvertBody } from './api';

/** The calls the conversion dialog makes. */
export type ConvertClient = Pick<CompileApi, 'check' | 'convert'>;

/** The saved file the person wants to convert: its path, text and version. */
export type ConvertTarget = { path: string; source: string; hash: string };

/** Everything the review showed, kept so the confirmation sends exactly that. */
export type ConvertReview = {
  /** The unit's report. Its digest binds the confirmation to the files the review saw. */
  report: LossReport;
  /** The values this file would lose, a part of the unit's report. */
  fileLosses: LossReport['losses'];
  inputs: ConvertBody['inputs'];
  before: string;
  after: string;
};

/** What the dialog shows. */
export type ConvertView =
  | { status: 'loading' }
  | { status: 'refused'; findings: CompileFinding[] }
  | { status: 'review'; review: ConvertReview }
  | { status: 'converting'; review: ConvertReview }
  | { status: 'done'; path: string }
  | { status: 'changed'; message: string }
  | { status: 'error'; message: string };

/** The words shown when the file or a sibling changed between the review and the confirmation. */
export const CHANGED_MESSAGE = 'The file or the project changed after you opened this review. Review the conversion again before you convert.';

function viewOfConversionFailure(error: unknown): ConvertView {
  const failure = isCompileFailure(error) ? error : null;
  if (failure?.status === 422) return { status: 'refused', findings: failure.body.findings ?? [] };
  if (failure?.status === 409 && ['version-changed', 'digest-mismatch'].includes(failure.body.error ?? '')) return { status: 'changed', message: CHANGED_MESSAGE };
  return { status: 'error', message: failure?.body.message ?? (error as Error).message ?? 'The request failed.' };
}

/** Compiles the one file here, so the person sees the standard text before anything is saved. The server compiles again before it writes. */
function afterText(target: ConvertTarget): { text: string } | { findings: CompileFinding[] } {
  const compiled = compileDocument({ path: target.path, source: target.source }, REGISTRY);
  if (compiled.ok) return { text: compiled.text };
  return { findings: compiled.failures.map(failure => ({ document: failure.document ?? target.path, severity: 'error', code: failure.code, path: '/', message: failure.message })) };
}

/** Checks the working copy, then shows what converting this file would change and drop. */
export async function startReview(client: ConvertClient, project: string, target: ConvertTarget): Promise<ConvertView> {
  try {
    const answer = await client.check(project, 'working');
    if (answer.result === 'refused') return { status: 'refused', findings: answer.findings };
    const seen = answer.report.inputs.find(input => input.path === target.path);
    if (!seen || seen.sha256 !== target.hash) return { status: 'changed', message: CHANGED_MESSAGE };
    const after = afterText(target);
    if ('findings' in after) return { status: 'refused', findings: after.findings };
    const inputs = answer.report.inputs.map(input => ({ path: input.path, sha256: input.sha256 }));
    const fileLosses = answer.report.losses.filter(loss => loss.document === target.path);
    return { status: 'review', review: { report: answer.report, fileLosses, inputs, before: target.source, after: after.text } };
  } catch (error) {
    return viewOfConversionFailure(error);
  }
}

/** Sends the confirmation with the file version, the input hashes and the digest of the review that is on screen. */
export async function confirmConversion(client: ConvertClient, project: string, target: ConvertTarget, review: ConvertReview): Promise<ConvertView> {
  try {
    await client.convert(project, { path: target.path, baseHash: target.hash, inputs: review.inputs, accept: { digest: review.report.digest } });
    return { status: 'done', path: target.path };
  } catch (error) {
    return viewOfConversionFailure(error);
  }
}

/** The control the dialog gets from the hook. */
export type ConvertControl = { view: ConvertView; convert: () => void; reload: () => void };

/** Reviews when the dialog opens and exposes the confirmation. */
export function useConvert(project: string, target: ConvertTarget, onConverted: () => void, client: ConvertClient = compileApi): ConvertControl {
  const [view, setView] = useState<ConvertView>({ status: 'loading' });
  const generation = useRef(0);
  const review = useCallback(async () => {
    const mine = ++generation.current;
    setView({ status: 'loading' });
    const next = await startReview(client, project, target);
    if (mine === generation.current) setView(next);
  }, [client, project, target]);
  useEffect(() => {
    void review();
    return () => {
      generation.current += 1;
    };
  }, [review]);
  const convert = useCallback(() => {
    if (view.status !== 'review') return;
    const shown = view.review;
    setView({ status: 'converting', review: shown });
    void confirmConversion(client, project, target, shown).then(next => {
      setView(next);
      if (next.status === 'done') onConverted();
    });
  }, [client, onConverted, project, target, view]);
  return { view, convert, reload: review };
}

/** What a base conversion preview showed: the text before and after, every change, and the hash the confirmation must name. */
export type BaseReview = { before: string; after: string; changes: BaseConversionChange[]; converted: string };

/** What the base conversion dialog shows. */
export type BaseConvertView =
  | { status: 'loading' }
  | { status: 'refused'; findings: CompileFinding[] }
  | { status: 'review'; review: BaseReview }
  | { status: 'converting'; review: BaseReview }
  | { status: 'done'; path: string }
  | { status: 'changed'; message: string }
  | { status: 'error'; message: string };

/** The calls the base conversion dialog makes: read the saved file again, and confirm. */
export type BaseConvertClient = Pick<CompileApi, 'convertBase'> & { file: (project: string, path: string) => Promise<ConvertTarget> };

const baseConvertClient: BaseConvertClient = { convertBase: compileApi.convertBase, file: (project, path) => api.file(project, path) };

/** Converts the file here, so the person sees every change before anything is saved. The server converts again before it writes. */
export function startBaseReview(target: ConvertTarget): BaseConvertView {
  try {
    const conversion = convertToDraftBase(target.source, target.path);
    return { status: 'review', review: { before: target.source, after: conversion.text, changes: conversion.changes, converted: conversion.sha256 } };
  } catch (error) {
    if (!(error instanceof BaseConversionRefusal)) throw error;
    return { status: 'refused', findings: [{ document: target.path, severity: 'error', code: error.code, path: '/', message: error.message }] };
  }
}

/** Reads the saved file again and previews its conversion, for a review that went stale or failed. */
export async function reviewSavedFile(client: Pick<BaseConvertClient, 'file'>, project: string, path: string): Promise<{ target?: ConvertTarget; view: BaseConvertView }> {
  try {
    const file = await client.file(project, path);
    const target = { path: file.path, source: file.source, hash: file.hash };
    return { target, view: startBaseReview(target) };
  } catch (error) {
    return { view: viewOfConversionFailure(error) as BaseConvertView };
  }
}

/** Sends the confirmation with the file version and the hash of the converted text on screen. */
export async function confirmBaseConversion(client: Pick<CompileApi, 'convertBase'>, project: string, target: ConvertTarget, review: BaseReview): Promise<BaseConvertView> {
  try {
    await client.convertBase(project, { path: target.path, baseHash: target.hash, converted: review.converted });
    return { status: 'done', path: target.path };
  } catch (error) {
    return viewOfConversionFailure(error) as BaseConvertView;
  }
}

/** The control the base conversion dialog gets. */
export type BaseConvertControl = { view: BaseConvertView; convert: () => void; reload: () => void };

/** Previews the base conversion when the dialog opens, exposes the confirmation, and reviews the saved file again on request. */
export function useBaseConvert(project: string, opened: ConvertTarget, onConverted: () => void, client: BaseConvertClient = baseConvertClient): BaseConvertControl {
  // The confirmation names the file version the preview on screen was made from, which a new review replaces.
  const [target, setTarget] = useState(opened);
  const [view, setView] = useState<BaseConvertView>(() => startBaseReview(opened));
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const reload = useCallback(() => {
    const mine = ++generation.current;
    setView({ status: 'loading' });
    void reviewSavedFile(client, project, target.path).then(next => {
      if (mine !== generation.current) return;
      if (next.target) setTarget(next.target);
      setView(next.view);
    });
  }, [client, project, target.path]);
  const convert = useCallback(() => {
    if (view.status !== 'review') return;
    const shown = view.review;
    setView({ status: 'converting', review: shown });
    void confirmBaseConversion(client, project, target, shown).then(next => {
      setView(next);
      if (next.status === 'done') onConverted();
    });
  }, [client, onConverted, project, target, view]);
  return { view, convert, reload };
}

/** The file a conversion wrote, by project and path. */
export type ConvertedFile = { project: string; path: string };

/** What reopening a converted file needs from the workspace, passed in so the decision can be tested. */
export type ReopenDeps<T extends ConvertedFile> = { refresh: () => Promise<T[]>; active: () => ConvertedFile | null; open: (doc: T) => void };

/**
 * After a conversion, reads the files again and opens the converted text, but only while that file
 * is still the one in the editor. A person who moved to another file keeps it.
 */
export async function reopenConverted<T extends ConvertedFile>(converted: ConvertedFile, deps: ReopenDeps<T>): Promise<void> {
  const docs = await deps.refresh();
  const active = deps.active();
  if (active?.project !== converted.project || active.path !== converted.path) return;
  const doc = docs.find(candidate => candidate.project === converted.project && candidate.path === converted.path);
  if (doc) deps.open(doc);
}

const ignoreCancel = () => {};

/** What Escape does in a conversion dialog: nothing while the save is in flight, like the disabled Cancel, so the dialog stays until the save answers. */
export function cancelDuringConversion(view: { status: string }, onClose: () => void): () => void {
  return view.status === 'converting' ? ignoreCancel : onClose;
}
