/** Presentation and event handling for source view. */
import { useCapabilities } from '../auth/Capabilities';
import React from 'react';
import type { Issue } from '../../shared/validation/diagnostics';
import type { CodeEditorHandle } from '../editor/CodeEditor';
import { CodeEditor } from '../editor/CodeEditor';
import { PartPicker, type PartSelection } from '../mesh/PartPicker';
import type { Doc } from '../projects/api';

type Props = {
  sourceEditor: React.RefObject<CodeEditorHandle | null>;
  current: Doc | null;
  partSelection?: PartSelection;
  openPart?: (path: string) => void;
  source: string;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setEditorIssues: React.Dispatch<
    React.SetStateAction<{
      id?: string | undefined;
      issues: Issue[];
      text?: string | undefined;
    } | null>
  >;
  assumeOssieVersion: boolean;
  validateAsShippedVersion: () => void;
};
/** Renders source view. */
export function SourceView({ sourceEditor, current, partSelection, openPart, source, setSource, setEditorIssues, assumeOssieVersion, validateAsShippedVersion }: Props) {
  const access = useCapabilities(current?.project);
  return (
    <>
      {partSelection && <PartPicker selection={partSelection} open={openPart} />}
      <CodeEditor
        disabled={!access.can('edit')}
        ref={sourceEditor}
        ariaLabel="Definition source"
        className="code"
        documentId={current?.id}
        filename={current?.filename ?? 'definition.yaml'}
        value={source}
        onChange={setSource}
        onIssues={(issues, text) => setEditorIssues({ id: current?.id, issues, text })}
        assumeOssieVersion={assumeOssieVersion}
        onValidateAsShippedVersion={validateAsShippedVersion}
      />
    </>
  );
}
