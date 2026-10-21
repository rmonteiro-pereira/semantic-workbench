import { existsSync, readFileSync } from 'node:fs';
import { readJson } from '../request';
import { decode, sha256 } from '../projects/atomic';
import { projectFile } from '../projects/paths';
import { appendIgnore } from '../../src/scm/gitignore';
import type { Route } from './http';
// Source Control (contracts/http-api.md). Remote actions run only from these explicit endpoints.
export const gitRoutes: Route = async (ws, req, url) => {
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/(git\/[a-z-]+|gitignore)$/);
  if (!m) return null;
  const slug = decodeURIComponent(m[1]),
    action = m[2],
    q = url.searchParams,
    scm = ws.scm;
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
    if (action === 'git/status') return Response.json(await scm.status(slug));
    if (action === 'git/diff') {
      const path = q.get('path');
      if (!path) throw Error('path is required.');
      return Response.json(
        await scm.diff(slug, path, q.get('from') ?? 'HEAD', q.get('to') ?? 'worktree'),
      );
    }
    if (action === 'git/branches') return Response.json(await scm.branches(slug));
    if (action === 'git/log')
      return Response.json(
        await scm.log(
          slug,
          q.get('path') ?? undefined,
          q.has('limit') ? Number(q.get('limit')) : undefined,
        ),
      );
    if (action === 'git/versions') {
      const path = q.get('path');
      if (!path) throw Error('path is required.');
      return Response.json(
        await scm.versions(slug, path, q.has('limit') ? Number(q.get('limit')) : undefined),
      );
    }
    if (action === 'git/show') {
      const commit = q.get('commit'),
        path = q.get('path');
      if (!commit || !path) throw Error('commit and path are required.');
      return Response.json(await scm.show(slug, commit, path));
    }
    return null;
  }
  if (req.method === 'POST') {
    if (action === 'git/stage' || action === 'git/unstage') {
      const b = await body(['paths', 'all']);
      const stage = action === 'git/stage';
      return Response.json(
        b.all === true
          ? await scm.stageAll(slug, stage)
          : stage
            ? await scm.stage(slug, b.paths)
            : await scm.unstage(slug, b.paths),
      );
    }
    if (action === 'git/commit') {
      const b = await body(['message', 'paths', 'push']);
      if (b.push !== undefined && typeof b.push !== 'boolean')
        throw Error('push must be true or false.');
      return Response.json(
        await scm.commit(slug, b.message, { paths: b.paths, push: b.push === true }),
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
    // FR-093/FR-095: append through the normal hash-checked save, which rescans the project.
    if (action === 'gitignore') {
      const b = await body(['pattern']);
      if (typeof b.pattern !== 'string' || b.pattern.length > 1000)
        throw Error('pattern must be one line of text.');
      ws.project(slug);
      const file = projectFile(ws.layout, slug, '.gitignore'),
        bytes = existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
      const current = bytes ? decode(bytes) : '',
        next = appendIgnore(current, b.pattern);
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
  return null;
};
