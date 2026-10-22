/** Shared options for the source editor and its view lifecycle. */
import type { Issue } from '../diagnostics';

/** Configures a source editor, optionally validating an item instead of a whole file. */
export type CodeEditorOptions = {
  value: string;
  filename: string;
  documentId?: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  onIssues?: (issues: Issue[], text: string) => void;
  validate?: (text: string) => Promise<Issue[]>;
};
