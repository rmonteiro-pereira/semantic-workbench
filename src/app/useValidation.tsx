/** Keeps editor validation responsive while deriving models for the other views. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Issue } from '../diagnostics';
import { validateInput } from '../input';
import type { Doc } from '../projects/api';
import { isGitignore } from '../scm/gitignore';

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
  const editorIssuesRef = useRef(editorIssues);
  editorIssuesRef.current = editorIssues;
  useEffect(() => {
    if (tab !== 'source' || settled.id !== current?.id)
      setSettled({ id: current?.id, text: source });
  }, [source, tab, current?.id]);
  const checkedSource = tab === 'source' && settled.id === current?.id ? settled.text : source;
  const plainText = !!current && isGitignore(current.filename);
  const checked = useMemo(
    () =>
      plainText
        ? { valid: true as const, model: null, issues: [] as Issue[] }
        : validateInput(checkedSource, current?.filename ?? 'definition.yaml'),
    [checkedSource, current?.filename, plainText],
  );
  const live =
    tab === 'source' && checkedSource !== source && editorIssues?.id === current?.id
      ? editorIssues!.issues
      : null;
  const validation = live
    ? { ...checked, issues: live, valid: !live.some(i => i.severity === 'error') }
    : checked;
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

  return { model, editorIssuesRef, validation, result, setEditorIssues, plainText };
}
