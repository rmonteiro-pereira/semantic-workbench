/** Keeps editor validation responsive while deriving models for the other views. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Issue } from '../../../shared/validation/diagnostics';
import { validateInput } from '../../../shared/validation/input';
import { isNotValidated } from '../../../shared/validation/validation';
import { DRAFT_CHECKS_LOADING, loadDraftValidators } from '../../../shared/validation/draft-validators';
import type { Doc } from '../../projects/api';
import { isGitignore } from '../../../shared/scm/gitignore';

type Options = { current: Doc | null; source: string; tab: string };
/** Manages validation. */
export function useValidation({ current, source, tab }: Options) {
  // While typing in Source, validation runs in the editor worker after a 300 ms pause.
  // Rebuild the model only when another view needs it, so keystrokes do not wait for a
  // parse on the main thread. A newly opened file is checked at once.
  const [settled, setSettled] = useState({ id: current?.id, text: source });
  const [editorIssues, setEditorIssues] = useState<{
    id?: string;
    issues: Issue[];
    text?: string;
  } | null>(null);
  // The user may ask to check a file with an unknown Ossie version as the shipped version. It applies to that file only.
  const [assumedVersionDocumentId, setAssumedVersionDocumentId] = useState<string | undefined>(undefined);
  const assumeOssieVersion = !!current && assumedVersionDocumentId === current.id;
  const editorIssuesRef = useRef(editorIssues);
  editorIssuesRef.current = editorIssues;
  useEffect(() => {
    if (tab !== 'source' || settled.id !== current?.id) setSettled({ id: current?.id, text: source });
  }, [source, tab, current?.id]);
  const checkedSource = tab === 'source' && settled.id === current?.id ? settled.text : source;
  const plainText = !!current && isGitignore(current.filename);
  // Counts loads of the Ossie 0.3 draft checks, so a check that ran before they arrived runs again.
  const [draftRevision, setDraftRevision] = useState(0);
  const checked = useMemo(
    () => (plainText ? { valid: true as const, model: null, issues: [] as Issue[] } : validateInput(checkedSource, current?.filename ?? 'definition.yaml', { assumeOssieVersion })),
    // draftRevision is not read inside: a new value asks for the same text to be checked again.
    [checkedSource, current?.filename, plainText, assumeOssieVersion, draftRevision],
  );
  // A file can declare the draft after it was opened, for example when its version is edited. Its
  // check then waits for the draft checks, so load them here and check again once they arrive. Each
  // new check that still waits asks again, so a failed load is retried after the next edit.
  useEffect(() => {
    if (!checked.issues.some(issue => issue.code === DRAFT_CHECKS_LOADING)) return;
    let mounted = true;
    void loadDraftValidators().then(
      () => mounted && setDraftRevision(revision => revision + 1),
      () => undefined,
    );
    return () => {
      mounted = false;
    };
  }, [checked]);
  const live = tab === 'source' && checkedSource !== source && editorIssues?.id === current?.id ? editorIssues!.issues : null;
  const validation = live ? { ...checked, issues: live, valid: !live.some(i => i.severity === 'error') } : checked;
  const result = {
    model: validation.model,
    error:
      (source || current) && !validation.valid
        ? validation.issues
            .filter(i => i.severity === 'error')
            .map(i => i.message)
            .join('\n')
        : '',
  };
  const model = result.model;

  const validated = !plainText && !validation.issues.some(isNotValidated);
  const validateAsShippedVersion = () => setAssumedVersionDocumentId(current?.id);
  return { model, editorIssuesRef, validation, result, setEditorIssues, plainText, validated, assumeOssieVersion, validateAsShippedVersion };
}
