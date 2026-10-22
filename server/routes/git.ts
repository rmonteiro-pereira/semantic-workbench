// Exposes project source control operations. Remote actions run only through explicit requests.
import { requestReader } from '../auth/middleware';
import { existsSync, readFileSync } from 'node:fs';
import { readJson } from '../request';
import { decode, sha256 } from '../projects/atomic';
import { projectFile } from '../projects/paths';
import { appendIgnore } from '../../src/scm/gitignore';
import type { Route } from './http';
// Files are named relative to the project (`paths`) or to its repository root (`repoPaths`), the
// latter for files of sibling projects in a shared repository.
function chosenPaths(body: { paths?: unknown; repoPaths?: unknown }) {
  if (body.paths !== undefined && body.repoPaths !== undefined)
    throw Error('Send paths or repoPaths, not both.');
  if (body.repoPaths !== undefined) return { list: body.repoPaths, base: 'repository' as const };
  return { list: body.paths, base: 'project' as const };
}
/** Handles source control requests, including explicitly requested remote actions. */
export const gitRoutes: Route = async (ws, req, url) => {
  // The credential helper set in the user's or system Git settings; credentials are never read.
  if (url.pathname === '/api/git/credential-helper' && req.method === 'GET')
    return Response.json(await ws.credentialHelper());
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/(git\/[a-z-]+|gitignore)$/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]);
  const action = m[2];
  const q = url.searchParams;
  const scm = ws.scm;
  const reader = requestReader(req);

  const body = async (keys: string[]) => {
    const b = await readJson(req, 64_000);
    if (
      !b ||
      typeof b !== 'object' ||
      Array.isArray(b) ||
      Object.keys(b).some(k => !keys.includes(k))
    )
      throw Error(`Expected {${keys.join(', ')}}.`);
    return b;
  };
  if (req.method === 'GET') {
    if (action === 'git/status') return Response.json(await scm.status(slug, reader));
    if (action === 'git/identity') return Response.json(await ws.identity(slug));
    if (action === 'git/diff') {
      const repoPath = q.get('repoPath');
      const path = repoPath ?? q.get('path');
      if (!path) throw Error('path or repoPath is required.');
      const base = repoPath === null ? 'project' : 'repository';
      return Response.json(
        await scm.diff(
          slug,
          path,
          q.get('from') ?? 'HEAD',
          q.get('to') ?? 'worktree',
          base,
          reader,
        ),
      );
    }
    if (action === 'git/branches') return Response.json(await scm.branches(slug));
    if (action === 'git/log')
      return Response.json(
        await scm.log(
          slug,
          q.get('path') ?? undefined,
          q.has('limit') ? Number(q.get('limit')) : undefined,
          reader,
        ),
      );
    if (action === 'git/versions') {
      const path = q.get('path');
      if (!path) throw Error('path is required.');
      return Response.json(
        await scm.versions(slug, path, q.has('limit') ? Number(q.get('limit')) : undefined, reader),
      );
    }
    if (action === 'git/show') {
      const commit = q.get('commit');
      const path = q.get('path');
      if (!commit || !path) throw Error('commit and path are required.');
      return Response.json(await scm.show(slug, commit, path, reader));
    }
    return null;
  }
  if (req.method === 'POST') {
    if (action === 'git/stage' || action === 'git/unstage') {
      const b = await body(['paths', 'repoPaths', 'all']);
      const stage = action === 'git/stage';
      if (b.all === true) return Response.json(await scm.stageAll(slug, stage));
      const { list, base } = chosenPaths(b);
      return Response.json(
        stage ? await scm.stage(slug, list, base) : await scm.unstage(slug, list, base),
      );
    }
    if (action === 'git/commit') {
      const b = await body(['message', 'paths', 'repoPaths', 'push']);
      if (b.push !== undefined && typeof b.push !== 'boolean')
        throw Error('push must be true or false.');
      const chosen = b.paths === undefined && b.repoPaths === undefined ? null : chosenPaths(b);
      return Response.json(
        await scm.commit(slug, b.message, {
          paths: chosen?.list,
          base: chosen?.base,
          push: b.push === true,
        }),
      );
    }
    if (action === 'git/revert') {
      const b = await body(['path', 'baseHash']);
      if (typeof b.path !== 'string') throw Error('path is required.');
      return Response.json(await ws.revertFile(slug, b.path, b.baseHash ?? null));
    }
    if (action === 'git/switch') {
      const b = await body(['branch', 'create']);
      return Response.json(await scm.switchBranch(slug, b.branch, b.create === true));
    }
    if (action === 'git/fetch') return Response.json(await scm.fetch(slug));
    if (action === 'git/pull') return Response.json(await scm.pull(slug));
    if (action === 'git/push') return Response.json(await scm.push(slug));
    if (action === 'git/sync') return Response.json(await scm.sync(slug));
    if (action === 'git/cancel') return Response.json(scm.cancel(slug));
    // Use the hash-checked save so concurrent edits are detected and the project is rescanned.
    if (action === 'gitignore') {
      const b = await body(['pattern']);
      if (typeof b.pattern !== 'string' || b.pattern.length > 1000)
        throw Error('pattern must be one line of text.');
      ws.project(slug);
      const file = projectFile(ws.layout, slug, '.gitignore');
      const bytes = existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
      const current = bytes ? decode(bytes) : '';
      const next = appendIgnore(current, b.pattern);
      const hash =
        next === null
          ? sha256(bytes!)
          : (
              await ws.saveFile(slug, '.gitignore', {
                baseHash: bytes ? sha256(bytes) : null,
                source: next,
              })
            ).hash;
      return Response.json({
        hash,
        added: next !== null,
        tracked: ws.gitAvailable ? await scm.ignoredButTracked(slug) : [],
      });
    }
    return null;
  }
  if (req.method === 'PUT' && action === 'git/remote') {
    const b = await body(['name', 'url']);
    return Response.json(await scm.setRemote(slug, b.name, b.url));
  }
  if (req.method === 'DELETE' && action === 'git/remote') {
    const b = await body(['name']);
    return Response.json(await scm.removeRemote(slug, b.name));
  }
  if (req.method === 'PUT' && action === 'git/identity') {
    const b = await body(['name', 'email', 'allRepositories']);
    if (b.allRepositories !== undefined && typeof b.allRepositories !== 'boolean')
      throw Error('allRepositories must be true or false.');
    return Response.json(await ws.setIdentity(slug, b.name, b.email, b.allRepositories === true));
  }
  return null;
};
