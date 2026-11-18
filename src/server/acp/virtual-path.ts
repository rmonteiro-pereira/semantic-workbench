// The agent's view of file names: one fixed root, then a project and a path inside it. Nothing here touches a disk.
import { SLUG } from '../projects/paths';

/** The fixed first segment of every path the agent sees. */
export const VIRTUAL_ROOT = '/workbench';
/** Longest virtual path, in bytes, that the agent may send. */
export const MAXIMUM_VIRTUAL_PATH_BYTES = 1024;

/** Why a path was refused. The agent is never told more than "not available", so these only serve tests and audit counts. */
export type VirtualPathRefusal = 'prefix' | 'length' | 'characters' | 'encoded-separator' | 'segment' | 'project' | 'no-file';
/** A parsed virtual path or the reason it was refused. */
export type VirtualPathResult = { ok: true; project: string; path: string } | { ok: false; reason: VirtualPathRefusal };

// Control characters never belong in a file name, so one anywhere refuses the whole path.
// oxlint-disable-next-line no-control-regex
const CONTROL_OR_BACKSLASH = /[\x00-\x1f\x7f\\]/;
const ENCODED_SEPARATOR_OR_DOT = /%(2f|5c|2e)/i;
const DRIVE_LETTER = /^[a-zA-Z]:/;

function refuse(reason: VirtualPathRefusal): VirtualPathResult {
  return { ok: false, reason };
}

function hasUnsafeSegment(segments: readonly string[]): boolean {
  return segments.some(segment => segment === '' || segment === '.' || segment === '..' || DRIVE_LETTER.test(segment) || segment.toLowerCase() === '.git');
}

/** Splits `/workbench/<project>/<path>` into its project and path, or says why not. */
export function parseVirtualPath(value: unknown): VirtualPathResult {
  if (typeof value !== 'string') return refuse('characters');
  if (Buffer.byteLength(value) > MAXIMUM_VIRTUAL_PATH_BYTES) return refuse('length');
  if (CONTROL_OR_BACKSLASH.test(value)) return refuse('characters');
  if (ENCODED_SEPARATOR_OR_DOT.test(value)) return refuse('encoded-separator');
  if (!value.startsWith(VIRTUAL_ROOT + '/')) return refuse('prefix');
  const segments = value.slice(VIRTUAL_ROOT.length + 1).split('/');
  const [project, ...fileSegments] = segments;
  if (!SLUG.test(project)) return refuse('project');
  if (fileSegments.length === 0) return refuse('no-file');
  if (hasUnsafeSegment(fileSegments)) return refuse('segment');
  return { ok: true, project, path: fileSegments.join('/') };
}

/** Builds the virtual path the agent uses for a project file. */
export function formatVirtualPath(project: string, path: string): string {
  return `${VIRTUAL_ROOT}/${project}/${path}`;
}
