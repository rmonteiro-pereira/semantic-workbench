/** Defines browser requests and response types for project files, metrics and source control. */
import type { KpiSummary, KpiExplanation } from '../../server/agent/explain';
import type { GitIdentity } from '../../server/projects/git';
import type { CloneEvent } from '../../server/projects/clone';
import type { ProjectCandidates } from '../../server/projects/repository-projects';
import type { RepositoryProject } from '../../server/projects/repositories';
import type { ClassificationSettings, Demotion, Person } from '../governance/guards';
// Browser client for the project API (contracts/http-api.md).
/** Summarizes a project file’s type, validation, visibility, Git state and hash. */
export type ProjectFile = {
  path: string;
  docType: string;
  layout?: string | null;
  valid: boolean;
  visible: boolean;
  gitState: string;
  hash: string;
};
/** Summarizes a project, its Git state and indexed files. */
export type ProjectInfo = {
  hiddenFiles?: number;
  /** Server mode only: the actions the signed-in person may take on this project. */
  actions?: string[];
  /** Server mode only: how classification values map to levels, and the protected level. */
  classification?: ClassificationSettings;
  slug: string;
  name: string;
  origin: string;
  /** The repository folder that holds the project; shared by subfolder projects. */
  repo: string;
  /** The project's folder inside its repository; empty for the repository itself. */
  folder: string;
  branch: string;
  ahead: number;
  behind: number;
  changes: number;
  files: ProjectFile[];
};
/** Describes a deleted entry and its restoration and undo metadata. */
export type TrashItem = {
  entryId: string;
  kind: 'file' | 'project' | 'subproject' | 'repository';
  project: string;
  projectName: string;
  path?: string;
  deletedAt: string;
  undoUntil: string;
  batchId: string | null;
};
/** Lists removed files, unsaved drafts and references broken by a deletion. */
export type Impact = {
  /** Whether the project is a subfolder of a repository it may share with other projects. */
  subproject?: boolean;
  repo?: string;
  sharedWith?: string[];
  removes: { project: string; name?: string; files: string[] };
  unsavedDrafts: { project: string; path: string }[];
  brokenReferences: {
    from: { project: string; path: string };
    to: { project: string; path: string };
    kind: string;
    name: string;
  }[];
};
/** Describes a proposed file move and the evidence linking it to a project. */
export type Suggestion = {
  id: string;
  file: { project: string; path: string; hash: string };
  targetProject: string;
  evidence: { kind: string; detail: string; otherFile: { project: string; path: string } }[];
};
/** Reports whether imported files were committed or why no commit was created. */
export type ImportCommit =
  | { committed: true; commit: string; message: string }
  | { committed: false; reason: 'no-git' | 'no-identity' | 'merging' | 'nothing' };
/** Identifies a completed deletion batch and its undo deadline. */
export type Deleted = { entryIds: string[]; undoUntil: string; label: string };
/** Holds an open document's identity, source and saved content hash. */
export type Doc = {
  id: string;
  project: string;
  path: string;
  filename: string;
  source: string;
  hash: string;
};
/** Reports Git availability, identity setup, migration and recovery results. */
/**
 * Workspace status. In server mode only Admins receive the details; everyone else gets
 * `{ mode, gitAvailable, ready }`, so every detail field is optional.
 */
export type WorkspaceStatus = {
  gitAvailable: boolean;
  mode?: 'local' | 'server';
  ready?: boolean;
  identityConfigured?: boolean;
  migration?: null | {
    status: 'completed' | 'postponed' | 'failed';
    reason?: string;
    backup?: string;
    projects: { slug: string; name: string; files: number }[];
    files: number;
    verified: number;
  };
  recovery?: { opId: string; kind: string; outcome: string; paths: string[] }[];
  repositories?: { repo: string; identityConfigured: boolean; projects: string[] }[];
};
// The browser shares these shapes with the API instead of keeping copies that could drift.
export type { GitIdentity, CloneEvent, ProjectCandidates, RepositoryProject };
/** Describes index and working-tree changes for a project path. */
export type GitChange = {
  path: string;
  orig?: string;
  index: string;
  worktree: string;
  conflicted: boolean;
  untracked: boolean;
  hidden: boolean;
  label?: string;
  /** The path from the repository root; Git actions on the change use it. */
  repoPath: string;
  /** Set when the file lies outside the viewed project. */
  outside?: boolean;
  /** The project that holds the file, absent for files that belong to no project. */
  project?: string;
  /** The file's path inside that project. */
  projectPath?: string;
};
/** Summarizes branch tracking, repository capabilities and changed files. */
export type GitStatus = {
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  gitAvailable: boolean;
  identityConfigured: boolean;
  merging: boolean;
  remotes: Record<string, string>;
  changes: GitChange[];
};
/** Reports completion, cancellation, conflicts and altered paths after a remote action. */
export type RemoteResult = {
  ok: boolean;
  cancelled?: boolean;
  ahead: number;
  behind: number;
  conflicted: string[];
  altered: string[];
  stderr: string;
};
/** Holds before and after file contents and existence flags for a comparison. */
export type GitDiff = {
  path: string;
  from: string;
  to: string;
  before: string;
  after: string;
  binary: boolean;
  beforeExists: boolean;
  afterExists: boolean;
};
/** Describes a commit's identity, author, date and message. */
export type GitCommit = { commit: string; author: string; date: string; message: string };
// 409 from pull, sync or switch: unsaved drafts or a dirty tree.
/** Reports a Git operation blocked by unsaved drafts or a dirty working tree. */
export class Blocked extends Error {
  constructor(
    public reason: 'drafts' | 'dirty',
    public paths: string[],
    message: string,
  ) {
    super(message);
  }
}
/** Carries the current disk version after a save's base hash is rejected. */
export class StaleSave extends Error {
  constructor(
    public currentHash: string | null,
    public currentSource: string | null,
  ) {
    super('This file changed since you opened it.');
  }
}
/** Builds an open-document identifier from project and file path. */
export const docId = (project: string, path: string) => `${project}/${path}`;
/** Builds the file API URL with each path segment encoded. */
export const fileUrl = (project: string, path: string) =>
  `/api/projects/${encodeURIComponent(project)}/files/${path.split('/').map(encodeURIComponent).join('/')}`;
let leavingPage = false;

/**
 * Records that the page is navigating away, for example to sign out. A 401 answer or an access
 * event after that point must not reload the page, because a reload would cancel the navigation
 * and start a new sign-in instead.
 */
export function startLeavingPage() {
  leavingPage = true;
}

/** Reloads once so the server can apply a changed session or access, unless the page is leaving. */
export function reloadForAccessChange() {
  if (leavingPage) return;
  leavingPage = true;
  globalThis.location.reload();
}

/** Sends same-origin API requests and restarts authentication once after session expiry. */
export async function apiFetch(input: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('X-SW-Request', '1');
  const response = await globalThis.fetch(input, { ...options, headers });
  if (response.status === 401) reloadForAccessChange();
  return response;
}

async function json<T>(response: Response): Promise<T> {
  const body = await response
    .json()
    .catch(() => ({ error: `Request failed (${response.status}).` }));
  if (!response.ok) {
    const error = Object.assign(Error(body.error ?? `Request failed (${response.status}).`), {
      status: response.status,
      body,
    });
    throw error;
  }
  return body as T;
}
const send = (method: string, body?: unknown) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});
/** Supplies a metric definition, extension attributes and optional concept binding. */
export type KpiSaveRequest = {
  semanticPath: string;
  modelPath?: (string | number)[];
  existing?: boolean;
  metric: { name: string; expression: string; description?: string; datatype?: string };
  extension: Record<string, any>;
  binding?: { measures: string; of?: string };
};
/** Selects grain, dimensions and rollup options for a metric explanation. */
export type ExplainQuery = { grain?: string; dimensions?: string[]; rollup?: string };
const explainQuery = (q: ExplainQuery) => {
  const p = new URLSearchParams();
  if (q.grain) p.set('grain', q.grain);
  for (const d of q.dimensions ?? []) p.append('dimension', d);
  if (q.rollup) p.set('rollup', q.rollup);
  const s = p.toString();
  return s ? '?' + s : '';
};
/** Provides browser operations for projects, documents, imports and metrics. */
export const api = {
  metrics: (project: string) =>
    apiFetch(`/api/projects/${encodeURIComponent(project)}/metrics`).then(r =>
      json<KpiSummary[]>(r),
    ),
  explain: (
    project: string,
    path: string,
    metric: string,
    q: ExplainQuery = {},
    signal?: AbortSignal,
  ) =>
    apiFetch(`${fileUrl(project, path)}/explain/${encodeURIComponent(metric)}${explainQuery(q)}`, {
      signal,
    }).then(r => json<KpiExplanation>(r)),
  status: () => apiFetch('/api/status').then(r => json<WorkspaceStatus>(r)),
  projects: () => apiFetch('/api/projects').then(r => json<ProjectInfo[]>(r)),
  /** People a metric owner in this project can be chosen from; empty in local mode. */
  people: (project: string) =>
    apiFetch(`/api/projects/${encodeURIComponent(project)}/people`).then(response =>
      json<Person[]>(response),
    ),
  file: (project: string, path: string) =>
    apiFetch(fileUrl(project, path)).then(r =>
      json<{ path: string; source: string; hash: string; docType: string }>(r),
    ),
  // A save sends patches against the version it started from when it has them, else the text.
  async save(
    project: string,
    path: string,
    baseHash: string | null,
    source: string,
    patches?: { from: number; to: number; insert: string }[],
  ) {
    const response = await apiFetch(
      fileUrl(project, path),
      send('PUT', patches && baseHash !== null ? { baseHash, patches } : { baseHash, source }),
    );
    if (response.status === 409) {
      const body = await response.json();
      throw new StaleSave(body.currentHash, body.currentSource);
    }
    return json<{ path: string; hash: string; source?: string; demoted?: Demotion[] }>(response);
  },
  // Several files of one project in one journaled save; a stale base hash rejects the whole batch.
  async saveBatch(
    project: string,
    files: {
      path: string;
      baseHash: string | null;
      source?: string;
      patches?: { from: number; to: number; insert: string }[];
    }[],
  ) {
    const response = await apiFetch(
      `/api/projects/${encodeURIComponent(project)}/save-batch`,
      send('POST', { files }),
    );
    if (response.status === 409) {
      const body = await response.json();
      throw new StaleSave(body.currentHash, body.currentSource);
    }
    return json<{
      written: { path: string; hash: string; created: boolean; source?: string }[];
      demoted?: Demotion[];
    }>(response);
  },
  previewKpi: (project: string, body: KpiSaveRequest) =>
    apiFetch(
      `/api/projects/${encodeURIComponent(project)}/metrics/preview`,
      send('POST', body),
    ).then(r =>
      json<{
        changes: { path: string; created: boolean; added: string[]; removed: string[] }[];
        explanation: KpiExplanation;
      }>(r),
    ),
  async saveKpi(project: string, body: KpiSaveRequest & { baseHashes: Record<string, string> }) {
    const response = await apiFetch(
      `/api/projects/${encodeURIComponent(project)}/metrics`,
      send('POST', body),
    );
    if (response.status === 409) {
      const b = await response.json();
      throw new StaleSave(b.currentHash, b.currentSource);
    }
    return json<{ written: { path: string; hash: string; created: boolean }[] }>(response);
  },
  importBatch: async (files: { path: string; source: string }[], name?: string, domain?: string) =>
    apiFetch('/api/import', send('POST', { files, ...(name ? { name } : {}), domain })).then(r =>
      json<{
        slug: string;
        name: string;
        written: { path: string; hash: string }[];
        commit?: ImportCommit;
      }>(r),
    ),
  deleteImpact: (project: string, path?: string) =>
    apiFetch(
      `/api/projects/${encodeURIComponent(project)}/delete-impact${path !== undefined ? '?path=' + encodeURIComponent(path) : ''}`,
    ).then(r => json<Impact>(r)),
  deleteFile: (project: string, path: string) =>
    apiFetch(fileUrl(project, path), send('DELETE', { confirm: true })).then(r =>
      json<{ entryId: string; undoUntil: string }>(r),
    ),
  deleteProject: (project: string) =>
    apiFetch(
      `/api/projects/${encodeURIComponent(project)}`,
      send('DELETE', { mode: 'delete', confirm: true }),
    ).then(r => json<{ entryId: string; undoUntil: string }>(r)),
  /** Takes a project out of the workspace; its folder and history stay on disk. */
  removeProject: (project: string) =>
    apiFetch(
      `/api/projects/${encodeURIComponent(project)}`,
      send('DELETE', { mode: 'remove' }),
    ).then(r => json<{ removed: string }>(r)),
  projectCandidates: (repo: string) =>
    apiFetch(`/api/repos/${encodeURIComponent(repo)}/project-candidates`).then(r =>
      json<ProjectCandidates>(r),
    ),
  setRepositoryProjects: (
    repo: string,
    projects: RepositoryProject[],
    manifest?: { baseHash: string | null },
  ) =>
    apiFetch(
      `/api/repos/${encodeURIComponent(repo)}/projects`,
      send('PUT', {
        projects,
        ...(manifest ? { saveManifest: true, manifestBaseHash: manifest.baseHash } : {}),
      }),
    ).then(r => json<{ projects: { slug: string; name: string; folder: string }[] }>(r)),
  clear: () =>
    apiFetch('/api/clear', send('POST', { confirm: true })).then(r =>
      json<{ batchId: string | null; entries: string[]; undoUntil: string | null }>(r),
    ),
  trash: () => apiFetch('/api/trash').then(r => json<TrashItem[]>(r)),
  undo: (id: string) => apiFetch(`/api/trash/${id}/undo`, send('POST')).then(r => json<any>(r)),
  restore: (id: string, target: { toProject?: string; toPath?: string } = {}) =>
    apiFetch(`/api/trash/${id}/restore`, send('POST', target)).then(r => json<any>(r)),
  purge: (id: string) =>
    apiFetch(`/api/trash/${id}`, send('DELETE', { confirm: true })).then(r => {
      if (!r.ok) return json(r);
    }),
  emptyTrash: () =>
    apiFetch('/api/trash', send('DELETE', { confirm: true })).then(r => {
      if (!r.ok) return json(r);
    }),
  drafts: () => apiFetch('/api/drafts').then(r => json<{ project: string; path: string }[]>(r)),
  rename: (project: string, name: string) =>
    apiFetch(`/api/projects/${encodeURIComponent(project)}`, send('PATCH', { name })).then(r =>
      json<{ slug: string; name: string }>(r),
    ),
  move: (project: string, path: string, toProject: string, toPath?: string) =>
    apiFetch(
      `/api/projects/${encodeURIComponent(project)}/move`,
      send('POST', { path, toProject, ...(toPath ? { toPath } : {}) }),
    ).then(r => json<{ project: string; path: string }>(r)),
  importInto: (
    project: string,
    files: { path: string; source: string }[],
    onConflict?: 'replace' | 'keep-both',
  ) =>
    apiFetch(
      `/api/projects/${encodeURIComponent(project)}/import`,
      send('POST', { files, ...(onConflict ? { onConflict } : {}) }),
    ).then(r => json<{ written: { path: string; hash: string }[]; commit?: ImportCommit }>(r)),
  suggestions: () => apiFetch('/api/suggestions').then(r => json<Suggestion[]>(r)),
  acceptSuggestion: (id: string) =>
    apiFetch(`/api/suggestions/${id}/accept`, send('POST')).then(r =>
      json<{ project: string; path: string }>(r),
    ),
  rejectSuggestion: (id: string) =>
    apiFetch(`/api/suggestions/${id}/reject`, send('POST')).then(r => json<unknown>(r)),
  example: async (id: string, domain?: string) =>
    apiFetch(`/api/examples/${encodeURIComponent(id)}`, send('POST', { domain })).then(r =>
      json<{ slug: string; name: string; created: boolean; commit?: ImportCommit }>(r),
    ),
};
const gitUrl = (project: string, action: string) =>
  `/api/projects/${encodeURIComponent(project)}/${action}`;
async function gitPost<T>(project: string, action: string, body?: unknown): Promise<T> {
  const response = await apiFetch(gitUrl(project, action), send('POST', body));
  if (response.status === 409) {
    const b = await response.json();
    throw new Blocked(b.error, b.paths ?? [], b.message ?? b.error);
  }
  return json<T>(response);
}
/** Provides browser operations for source-control review and Git actions. */
export const scm = {
  status: (p: string) => apiFetch(gitUrl(p, 'git/status')).then(r => json<GitStatus>(r)),
  diff: (p: string, path: string, from = 'HEAD', to = 'worktree') =>
    apiFetch(
      gitUrl(p, 'git/diff') +
        `?path=${encodeURIComponent(path)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ).then(r => json<GitDiff>(r)),
  /** The diff of a changed file named by its path from the repository root. */
  changeDiff: (p: string, repoPath: string, from: string, to: string) =>
    apiFetch(
      gitUrl(p, 'git/diff') +
        `?repoPath=${encodeURIComponent(repoPath)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ).then(r => json<GitDiff>(r)),
  stage: (p: string, paths: string[] | 'all') =>
    gitPost<GitStatus>(p, 'git/stage', paths === 'all' ? { all: true } : { paths }),
  unstage: (p: string, paths: string[] | 'all') =>
    gitPost<GitStatus>(p, 'git/unstage', paths === 'all' ? { all: true } : { paths }),
  /** Stages or unstages changed files named by their paths from the repository root. */
  stageChanges: (p: string, repoPaths: string[], stage: boolean) =>
    gitPost<GitStatus>(p, stage ? 'git/stage' : 'git/unstage', { repoPaths }),
  // `paths`: commit exactly these files (git commit --only); `push`: then push and report the
  // outcome.
  async commit(
    p: string,
    message: string,
    options: { paths?: string[]; repoPaths?: string[]; push?: boolean } = {},
  ) {
    const response = await apiFetch(gitUrl(p, 'git/commit'), send('POST', { message, ...options }));
    if (response.status === 409) {
      const b = await response.json();
      throw Object.assign(Error(b.message ?? b.error), { status: 409, body: b });
    }
    return json<{ commit: string; altered: string[]; pushed?: { ok: boolean; message: string } }>(
      response,
    );
  },
  // Revert to last commit: `baseHash` is the hash of the file now on disk (null if absent).
  async revert(p: string, path: string, baseHash: string | null) {
    const response = await apiFetch(gitUrl(p, 'git/revert'), send('POST', { path, baseHash }));
    if (response.status === 409) {
      const b = await response.json();
      throw new StaleSave(b.currentHash, b.currentSource);
    }
    return json<{ hash: string | null; trashEntry: string | null }>(response);
  },
  branches: (p: string) =>
    apiFetch(gitUrl(p, 'git/branches')).then(r =>
      json<{ current: string; local: string[]; remote: string[] }>(r),
    ),
  switch: (p: string, branch: string, create = false) =>
    gitPost<{ branch: string; altered: string[] }>(p, 'git/switch', { branch, create }),
  setRemote: (p: string, name: string, url: string) =>
    apiFetch(gitUrl(p, 'git/remote'), send('PUT', { name, url })).then(r =>
      json<{ name: string; url: string }>(r),
    ),
  removeRemote: (p: string, name: string) =>
    apiFetch(gitUrl(p, 'git/remote'), send('DELETE', { name })).then(r =>
      json<{ removed: string }>(r),
    ),
  identity: (p: string) => apiFetch(gitUrl(p, 'git/identity')).then(r => json<GitIdentity>(r)),
  setIdentity: (p: string, name: string, email: string, allRepositories = false) =>
    apiFetch(gitUrl(p, 'git/identity'), send('PUT', { name, email, allRepositories })).then(r =>
      json<{ repositories: string[] }>(r),
    ),
  credentialHelper: () =>
    apiFetch('/api/git/credential-helper').then(r => json<{ helper: string | null }>(r)),
  clone: async (url: string, name?: string, domain?: string) =>
    apiFetch('/api/clone', send('POST', { url, ...(name ? { name } : {}), domain })).then(r =>
      json<{ op: string; name: string; slug: string }>(r),
    ),
  cancelClone: (op: string) =>
    apiFetch(`/api/clone/${encodeURIComponent(op)}/cancel`, send('POST')).then(r =>
      json<{ cancelled: boolean }>(r),
    ),
  remote: (p: string, action: 'fetch' | 'pull' | 'push' | 'sync') =>
    gitPost<RemoteResult>(p, 'git/' + action),
  cancel: (p: string) => gitPost<{ cancelled: boolean }>(p, 'git/cancel'),
  log: (p: string, path?: string, limit = 50) =>
    apiFetch(
      gitUrl(p, 'git/log') + `?limit=${limit}${path ? '&path=' + encodeURIComponent(path) : ''}`,
    )
      .then(r => json<GitCommit[] | { commits: GitCommit[]; hiddenCommits: number }>(r))
      .then(history => (Array.isArray(history) ? { commits: history, hiddenCommits: 0 } : history)),
  versions: (p: string, path: string, limit = 20) =>
    apiFetch(gitUrl(p, 'git/versions') + `?path=${encodeURIComponent(path)}&limit=${limit}`).then(
      r => json<(GitCommit & { source: string })[]>(r),
    ),
  ignore: (p: string, pattern: string) =>
    gitPost<{ hash: string; added: boolean; tracked: string[] }>(p, 'gitignore', { pattern }),
  saveDraft: (p: string, path: string, baseHash: string | null, text: string) =>
    apiFetch(
      `/api/drafts/${encodeURIComponent(p)}/${path.split('/').map(encodeURIComponent).join('/')}`,
      send('PUT', { baseHash, text, patches: [] }),
    ),
  deleteDraft: (p: string, path: string) =>
    apiFetch(
      `/api/drafts/${encodeURIComponent(p)}/${path.split('/').map(encodeURIComponent).join('/')}`,
      { method: 'DELETE' },
    ),
};

/** Loads visible project files while reusing sources whose hashes are unchanged. */
export async function loadWorkspace(previous: Map<string, Doc>) {
  const projects = await api.projects();
  const docs = await Promise.all(
    projects.flatMap(p =>
      p.files
        .filter(f => f.visible)
        .map(async f => {
          const id = docId(p.slug, f.path);
          const old = previous.get(id);
          if (old && old.hash === f.hash) return old;
          try {
            const file = await api.file(p.slug, f.path);
            return {
              id,
              project: p.slug,
              path: f.path,
              filename: f.path.split('/').pop()!,
              source: file.source,
              hash: file.hash,
            } as Doc;
          } catch {
            return null;
          }
        }),
    ),
  );
  return { projects, docs: docs.filter((d): d is Doc => !!d) };
}
