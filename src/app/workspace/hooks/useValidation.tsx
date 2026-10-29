/** Keeps editor validation responsive while deriving models for the other views. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Issue } from '../../../shared/validation/diagnostics';
import { validateInput } from '../../../shared/validation/input';
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
  const checked = useMemo(
    () => (plainText ? { valid: true as const, model: null, issues: [] as Issue[] } : validateInput(checkedSource, current?.filename ?? 'definition.yaml', { assumeOssieVersion })),
    [checkedSource, current?.filename, plainText, assumeOssieVersion],
  );
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

  const validateAsShippedVersion = () => setAssumedVersionDocumentId(current?.id);
  return { model, editorIssuesRef, validation, result, setEditorIssues, plainText, assumeOssieVersion, validateAsShippedVersion };
}
