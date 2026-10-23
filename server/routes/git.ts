// Exposes project source control operations. Remote actions run only through explicit requests.
import { requestReader } from '../auth/request-scope';
import {
  authorizeCheckout,
  authorizeGitPaths,
  authorizeGitPush,
  authorizePublish,
  authorizeRepository,
  mayPublish,
} from '../auth/git-access';
import { checkRemoteAddress, delegatedCredentials } from '../auth/remote-credentials';
import { authorizeWrite } from '../auth/write-access';
import { existsSync, readFileSync } from 'node:fs';
import { readJson } from '../request';
import { decode, sha256 } from '../projects/atomic';
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
  const reader = requestReader(req);
  // A person's changes go to their own copy, created on first use. Each action authorizes its
  // targets first, so a refused request never creates one.
  const sourceControl = () => ws.scmFor(slug, reader);
  const gitTarget = { ws, request: req, slug };

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
    if (action === 'git/identity') return Response.json(await ws.identity(slug));
    // Reading never creates a copy: before their first change a person reads the published state.
    const scm = ws.readScm(slug, reader);
    if (action === 'git/status') return Response.json(await scm.status(slug, reader));
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
      await authorizeGitPaths(gitTarget, 'stage', {
        paths: b.all === true ? undefined : (b.repoPaths ?? b.paths),
        repository: b.repoPaths !== undefined,
      });
      const scm = await sourceControl();
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
      await authorizeGitPaths(gitTarget, 'commit', {
        paths: b.repoPaths ?? b.paths,
        repository: b.repoPaths !== undefined,
      });
      if (b.push === true) await authorizeGitPush(gitTarget);
      const chosen = b.paths === undefined && b.repoPaths === undefined ? null : chosenPaths(b);
      const scm = await sourceControl();
      return Response.json(
        await scm.commit(slug, b.message, {
          paths: chosen?.list,
          base: chosen?.base,
          push: b.push === true,
          credentialFor: delegatedCredentials(req),
          author: reader.copy?.author,
        }),
      );
    }
    if (action === 'git/revert') {
      const b = await body(['path', 'baseHash']);
      if (typeof b.path !== 'string') throw Error('path is required.');
      authorizeWrite(req, 'revert', [{ type: 'file', project: slug, path: b.path }]);
      const baseHash = b.baseHash ?? null;
      return Response.json(await ws.revertFile(slug, b.path, baseHash, reader));
    }
    if (action === 'git/switch') {
      authorizeRepository(gitTarget, 'branch');
      const b = await body(['branch', 'create']);
      const scm = await sourceControl();
      const checkout = (local: string) => authorizeCheckout(gitTarget, local);
      const create = b.create === true;
      return Response.json(await scm.switchBranch(slug, b.branch, create, reader, checkout));
    }
    if (action === 'git/publish') {
      const b = await body(['branch']);
      await authorizePublish(gitTarget, b.branch);
      return Response.json(await ws.publish(slug, reader));
    }
    if (action === 'git/pull-default') {
      authorizeRepository(gitTarget, 'pull');
      const scm = await sourceControl();
      return Response.json(await scm.pullDefault(slug, reader));
    }
    // Pushing the default branch changes what everyone pulls, so it needs the right to publish.
    if (action === 'git/push-default') {
      await authorizePublish(gitTarget, undefined);
      // The default branch is shared, so pushing it needs no copy and never starts one.
      const scm = ws.readScm(slug, reader);
      return Response.json(await scm.pushDefault(slug, delegatedCredentials(req)));
    }
    // Cancel stops what is running and never starts a copy.
    if (action === 'git/cancel') return Response.json(ws.readScm(slug, reader).cancel(slug));
    if (action === 'git/fetch') authorizeRepository(gitTarget, 'fetch');
    if (action === 'git/pull' || action === 'git/sync') {
      authorizeRepository(gitTarget, 'pull');
    }
    if (action === 'git/push' || action === 'git/sync') await authorizeGitPush(gitTarget);
    const remote = ['git/fetch', 'git/pull', 'git/push', 'git/sync'];
    const scm = remote.includes(action) ? await sourceControl() : null;
    // Remote commands run in the person's own copy with their own credential for the remote.
    const credentialFor = delegatedCredentials(req);
    if (action === 'git/fetch') {
      const follow = { reader, mayPublish: () => mayPublish(gitTarget) };
      return Response.json(await scm!.fetch(slug, credentialFor, follow));
    }
    if (action === 'git/pull') return Response.json(await scm!.pull(slug, reader, credentialFor));
    if (action === 'git/push') return Response.json(await scm!.push(slug, credentialFor));
    if (action === 'git/sync') return Response.json(await scm!.sync(slug, reader, credentialFor));
    // Use the hash-checked save so concurrent edits are detected and the project is rescanned.
    if (action === 'gitignore') {
      const b = await body(['pattern']);
      if (typeof b.pattern !== 'string' || b.pattern.length > 1000)
        throw Error('pattern must be one line of text.');
      authorizeWrite(req, 'edit', [{ type: 'file', project: slug, path: '.gitignore' }]);
      ws.project(slug);
      const file = ws.filePath(slug, '.gitignore', reader);
      const bytes = existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
      const current = bytes ? decode(bytes) : '';
      const next = appendIgnore(current, b.pattern);
      const hash =
        next === null
          ? sha256(bytes!)
          : (
              await ws.saveFile(
                slug,
                '.gitignore',
                { baseHash: bytes ? sha256(bytes) : null, source: next },
                reader,
              )
            ).hash;
      return Response.json({
        hash,
        added: next !== null,
        tracked: ws.gitAvailable ? await (await sourceControl()).ignoredButTracked(slug) : [],
      });
    }
    return null;
  }
  if (req.method === 'PUT' && action === 'git/remote') {
    const b = await body(['name', 'url']);
    // The remote belongs to the repository, so every project sharing it must allow the change.
    authorizeRepository(gitTarget, 'setRemote');
    // Server mode stores the canonical form of the address it checked.
    const address = checkRemoteAddress(req, b.url);
    return Response.json(await (await sourceControl()).setRemote(slug, b.name, address));
  }
  if (req.method === 'DELETE' && action === 'git/remote') {
    const b = await body(['name']);
    authorizeRepository(gitTarget, 'setRemote');
    return Response.json(await (await sourceControl()).removeRemote(slug, b.name));
  }
  if (req.method === 'PUT' && action === 'git/identity') {
    const b = await body(['name', 'email', 'allRepositories']);
    if (b.allRepositories !== undefined && typeof b.allRepositories !== 'boolean')
      throw Error('allRepositories must be true or false.');
    return Response.json(await ws.setIdentity(slug, b.name, b.email, b.allRepositories === true));
  }
  return null;
};
