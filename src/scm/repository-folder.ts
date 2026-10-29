/**
 * Checks the "Folder in repository" a project lives in, such as `semantic/ubl`. The browser and
 * the server run this same check, so a path the dialog accepts is a path the server accepts.
 */
import { hasControlCharacter } from '../shared/control-characters';

export type RepositoryFolderCheck = { ok: true; folder: string } | { ok: false; message: string };

const MAX_FOLDER_LENGTH = 500;
const MAX_SEGMENT_LENGTH = 255;
// Characters Git reads as patterns in a sparse checkout, as options, or as comments.
const PATTERN_CHARACTERS = /[*?[\]\\]/;

function refuse(message: string): RepositoryFolderCheck {
  return { ok: false, message };
}

function checkSegment(segment: string): string | null {
  if (segment === '') return 'The folder has an empty part (a double slash).';
  if (segment === '.') return 'The folder may not contain "." parts; write it without them.';
  if (segment === '..') return 'The folder may not contain ".." parts.';
  if (segment.toLowerCase() === '.git') return 'The folder may not be or contain .git.';
  if (segment.length > MAX_SEGMENT_LENGTH) return 'A part of the folder is too long.';
  if (segment.startsWith('-')) return 'A part of the folder may not start with a dash.';
  return null;
}

/**
 * Normalises a folder path typed by a person. An empty text means no folder, which is the whole
 * repository. A single trailing slash is dropped; everything else that is not already a clean
 * relative path is refused with a message that says what to change.
 */
export function checkRepositoryFolder(input: unknown): RepositoryFolderCheck {
  if (input === undefined || input === null) return { ok: true, folder: '' };
  if (typeof input !== 'string') return refuse('The folder must be text.');
  const trimmed = input.trim();
  if (trimmed === '') return { ok: true, folder: '' };
  if (trimmed.length > MAX_FOLDER_LENGTH) return refuse('The folder path is too long.');
  if (hasControlCharacter(trimmed)) return refuse('The folder may not contain control characters.');
  if (trimmed.includes('\\')) return refuse('Write the folder with forward slashes (a/b).');
  if (trimmed.startsWith('/') || /^[A-Za-z]:/.test(trimmed))
    return refuse('The folder must be relative to the repository, not an absolute path.');
  if (PATTERN_CHARACTERS.test(trimmed))
    return refuse('The folder may not contain * ? [ ] characters.');
  const folder = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  for (const segment of folder.split('/')) {
    const problem = checkSegment(segment);
    if (problem) return refuse(problem);
  }
  return { ok: true, folder };
}
