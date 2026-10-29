/** Shared options for the source editor and its view lifecycle. */
import type { Issue } from '../../shared/validation/diagnostics';

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
  /** Check the text as the Ossie version the app ships, even when the file names another one. */
  assumeOssieVersion?: boolean;
  /** Offered next to a "not validated" notice so the user can ask for that check. */
  onValidateAsShippedVersion?: () => void;
};
