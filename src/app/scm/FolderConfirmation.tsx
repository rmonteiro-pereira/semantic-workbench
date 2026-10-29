/** Shows what saving a project's folder in its repository will do, before the person confirms. */
import type { FolderPreview } from '../projects/api';

/** How many moved files the dialog lists; the count covers all of them. */
const LISTED_MOVES = 8;

function blockedText(blocked: NonNullable<FolderPreview['blocked']>) {
  if (blocked.reason === 'drafts') return 'Save or discard the unsaved edits first.';
  return 'Commit or discard the changes first; nothing is stashed automatically.';
}

// Each paragraph is one string: text split around inline markup would be measured as boxes that
// overlap when the paragraph wraps.
function MoveSummary({ preview }: { preview: FolderPreview }) {
  const listed = preview.moves.slice(0, LISTED_MOVES);
  const hidden = preview.moveCount - listed.length;
  return (
    <>
      <p>{`${preview.moveCount} files will be moved into the folder ${preview.folder}.`}</p>
      <p>A commit records the move. History is not rewritten and nothing is deleted.</p>
      <ul className="folder-moves" aria-label="Files that move">
        {listed.map(move => (
          <li key={move.from}>{`${move.from} → ${move.to}`}</li>
        ))}
        {hidden > 0 && <li>{`and ${hidden} more`}</li>}
      </ul>
    </>
  );
}

function ChangeSummary({ preview }: { preview: FolderPreview }) {
  return (
    <>
      <p>{`Only ${preview.folder} is checked out from now on.`}</p>
      <p>{`${preview.current} is removed from your disk. Commits you have not pushed stay in the repository.`}</p>
      {!preview.existsOnBranch && <p>{`${preview.folder} does not exist on this branch yet. The first push creates it.`}</p>}
    </>
  );
}

/** The preview of a folder change, with the reason it cannot be confirmed now, if any. */
export function FolderConfirmation({ preview }: { preview: FolderPreview }) {
  return (
    <div className="folder-confirmation" aria-label="Folder change">
      {preview.kind === 'move' ? <MoveSummary preview={preview} /> : <ChangeSummary preview={preview} />}
      {preview.blocked && (
        <p role="alert" className="dialog-error">
          {blockedText(preview.blocked)}
        </p>
      )}
    </div>
  );
}
