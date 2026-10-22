// Versions validated administration documents using the same restricted Git runner as projects.
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createGit, hasControlCharacters } from '../projects/git';
import { atomicWrite, encode } from '../projects/atomic';
import {
  emptyAccessConfig,
  validateAccessConfig,
  validateAccessDocument,
  type AccessConfig,
} from './access-config';
import { loadPolicySet } from './cedar';
import builtin from '../../policies/builtin-roles.json';
import type { Role } from './access-config';

/** Mirrors schemas/semantic-workbench-access-v1.json $defs.settingsFile with session defaults. */
export type WorkbenchSettings = {
  session: { idleHours: number; absoluteHours: number };
  remote?: {
    allowedHosts?: string[];
    azureDevOpsObo?: boolean;
    github?: { host?: string; appConfigured?: boolean };
  };
  audit?: { retentionDays?: number };
};

/** An invalid administration proposal, with the offending document in its message. */
export class AdminConfigError extends Error {}
/** A proposal based on a superseded administration commit. */
export class AdminStaleError extends Error {
  constructor() {
    super('stale administration version');
  }
}
/** The signed-in administrator recorded as the Git author. */
export type AdminAuthor = { name: string; email: string };
/** A versioned change with optimistic concurrency protection. */
export type AdminWrite = { author: AdminAuthor; message: string; baseVersion: string };
const documents = ['roles', 'grants', 'projects', 'agents', 'deactivated', 'settings'];
const committer = ['-c', 'user.name=Semantic Workbench', '-c', 'user.email=workbench@localhost'];
function validName(name: string): boolean {
  return (
    documents.some(area => name === `${area}.json`) ||
    /^policies\/[a-zA-Z0-9_-]+\.cedar$/.test(name)
  );
}
function defaultFiles(): Record<string, string> {
  const config = emptyAccessConfig();
  const values = {
    roles: { roles: [] },
    grants: { grants: [] },
    projects: config.projects,
    agents: config.agents,
    deactivated: config.deactivated,
    settings: {
      session: { idleHours: 8, absoluteHours: 24 },
      remote: {
        allowedHosts: [],
        azureDevOpsObo: false,
        github: { host: 'github.com', appConfigured: false },
      },
      audit: { retentionDays: 400 },
    },
  };
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      `${name}.json`,
      JSON.stringify(value, null, 2) + '\n',
    ]),
  );
}
function decodeFiles(files: Record<string, string>): AccessConfig {
  const parsed: Record<string, any> = {};
  const adminRules: Record<string, string> = {};
  for (const [name, text] of Object.entries(files)) {
    if (!validName(name)) throw new AdminConfigError(`${name}: unsupported administration file`);
    try {
      if (name.endsWith('.cedar')) {
        const id = /@id\("([^"\n]+)"\)/.exec(text)?.[1];
        if (!id || Object.hasOwn(adminRules, id)) throw new Error('Missing or duplicate policy id');
        adminRules[id] = text;
      } else {
        const area = name.slice(0, -5);
        parsed[area] = JSON.parse(text);
        validateAccessDocument(`${area}File`, parsed[area]);
      }
    } catch (error) {
      throw new AdminConfigError(`${name}: ${(error as Error).message}`);
    }
  }
  for (const area of documents) {
    if (!parsed[area]) throw new AdminConfigError(`${area}.json: missing document`);
  }
  try {
    return validateAccessConfig({
      roles: parsed.roles.roles,
      grants: parsed.grants.grants,
      projects: parsed.projects,
      agents: parsed.agents,
      deactivated: parsed.deactivated,
      adminRules,
    });
  } catch (error) {
    throw new AdminConfigError((error as Error).message);
  }
}
function checkAuthor(author: AdminAuthor): void {
  for (const value of [author.name, author.email]) {
    if (!value.trim() || hasControlCharacters(value) || /[<>]/.test(value)) {
      throw new AdminConfigError('Invalid administrator name or email.');
    }
  }
}
function checkVersion(version: string): void {
  if (!/^[0-9a-f]{40}$/.test(version)) throw new AdminConfigError('Invalid commit version.');
}

/** Opens the administration repository beneath an explicitly supplied data root. */
export function openAdminRepository(options: {
  root: string;
  validate?: (config: AccessConfig) => unknown;
  /** Receives the configuration of every new commit, so live decisions follow it at once. */
  committed?: (config: AccessConfig) => void;
}) {
  const root = join(options.root, 'admin');
  const git = createGit({ projectsRoot: options.root });
  let pending: Promise<unknown> = Promise.resolve();
  function serialized<T>(run: () => Promise<T>): Promise<T> {
    const result = pending.then(run);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  function readFiles(): Record<string, string> {
    const entries = readdirSync(root);
    const names = entries.filter(name => name !== '.git' && name !== 'policies');
    for (const name of names) {
      if (!validName(name)) throw new AdminConfigError(`${name}: unsupported administration file`);
    }
    const policies = join(root, 'policies');
    if (entries.includes('policies')) {
      if (!lstatSync(policies).isDirectory() || lstatSync(policies).isSymbolicLink())
        throw new AdminConfigError('policies: expected a directory');
      names.push(...readdirSync(policies).map(name => `policies/${name}`));
    }
    return Object.fromEntries(
      names.map(name => {
        if (!lstatSync(join(root, name)).isFile())
          throw new AdminConfigError(`${name}: expected a regular file`);
        return [name, readFileSync(join(root, name), 'utf8')];
      }),
    );
  }
  function validate(files: Record<string, string>): AccessConfig {
    const config = decodeFiles(files);
    try {
      loadPolicySet({
        builtinRoles: builtin.roles as Role[],
        customRoles: config.roles,
        adminRules: config.adminRules,
      });
      options.validate?.(config);
    } catch (error) {
      throw new AdminConfigError(`policies: ${(error as Error).message}`);
    }
    return config;
  }
  const version = async () => (await git.run(root, ['rev-parse', 'HEAD'])).stdout.trim();
  async function commit(author: AdminAuthor, message: string): Promise<string> {
    await git.run(root, ['add', '--all', '--', '.']);
    await git.run(root, [
      ...committer,
      'commit',
      '--allow-empty',
      '--author',
      `${author.name} <${author.email}>`,
      '-m',
      message,
    ]);
    return version();
  }
  async function restoreCommittedFiles(): Promise<void> {
    const head = await git.run(root, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
    if (head.code === 0) {
      await git.run(root, ['reset', '--hard', 'HEAD']);
    } else {
      // An unborn repository has no committed tree; clear its index before removing new files.
      await git.run(root, ['read-tree', '--empty']);
    }
    await git.run(root, ['clean', '-fd']);
  }
  async function withRollback<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      try {
        await restoreCommittedFiles();
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Administration write and rollback failed',
        );
      }
      throw error;
    }
  }
  async function ensure(): Promise<void> {
    return serialized(async () => {
      if (existsSync(root) && lstatSync(root).isSymbolicLink())
        throw new AdminConfigError('admin: symbolic link');
      mkdirSync(root, { recursive: true });
      if (!existsSync(join(root, '.git'))) await git.init(root);
      const head = await git.run(root, ['rev-parse', '--verify', 'HEAD'], { allowFailure: true });
      if (head.code === 0) return;
      const files = { ...defaultFiles(), ...readFiles() };
      validate(files);
      await withRollback(async () => {
        for (const [name, text] of Object.entries(files))
          atomicWrite(join(root, name), encode(text));
        await commit(
          { name: 'Semantic Workbench', email: 'workbench@localhost' },
          'access: Initialize',
        );
      });
    });
  }
  async function replace(files: Record<string, string>, change: AdminWrite): Promise<string> {
    checkAuthor(change.author);
    if (!/^[a-z][a-z-]*: \S[^\r\n]*$/.test(change.message))
      throw new AdminConfigError('Expected area: summary.');
    if ((await version()) !== change.baseVersion) throw new AdminStaleError();
    const config = validate(files);
    const previous = readFiles();
    const committedVersion = await withRollback(async () => {
      for (const [name, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, name)), { recursive: true });
        atomicWrite(join(root, name), encode(text));
      }
      for (const name of Object.keys(previous)) {
        if (!(name in files)) unlinkSync(join(root, name));
      }
      return await commit(change.author, change.message);
    });
    notifyCommitted(config, committedVersion);
    return committedVersion;
  }
  // The commit already exists, so a failing listener must not turn the write into an error: the
  // caller would retry a change that was saved. Decisions stay on the previous policy until the
  // next commit or restart reloads it.
  function notifyCommitted(config: AccessConfig, committedVersion: string): void {
    try {
      options.committed?.(config);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[admin] policy reload after commit ${committedVersion} failed: ${reason}`);
    }
  }
  async function write(files: Record<string, string>, change: AdminWrite): Promise<string> {
    await ensure();
    return serialized(() => replace({ ...readFiles(), ...files }, change));
  }
  async function versionFiles(target: string): Promise<Record<string, string>> {
    checkVersion(target);
    const names = (await git.run(root, ['ls-tree', '-r', '--name-only', target])).stdout
      .trim()
      .split('\n');
    const files: Record<string, string> = {};
    for (const name of names) {
      if (!validName(name)) throw new AdminConfigError(`${name}: unsupported administration file`);
      files[name] = (await git.run(root, ['show', `${target}:${name}`])).stdout;
    }
    return files;
  }
  async function rollback(target: string, change: Omit<AdminWrite, 'message'>) {
    await ensure();
    return serialized(async () =>
      replace(await versionFiles(target), {
        ...change,
        message: `access: Rollback to ${target}`,
      }),
    );
  }
  async function history(area?: string) {
    if (area && !validName(area)) throw new AdminConfigError(`${area}: unknown area`);
    const args = ['log', '--format=%H%x00%an%x00%ae%x00%aI%x00%s', '--name-only'];
    if (area) args.push('--', area);
    const output = (await git.run(root, args)).stdout.trim();
    if (!output) return [];
    return output.split(/\n(?=[0-9a-f]{40})/).map(record => {
      const [header, ...files] = record.split('\n');
      const [version, name, email, at, message] = header.split('\0');
      return { version, author: { name, email }, at, message, files: files.filter(Boolean) };
    });
  }
  async function diff(target: string, against?: string): Promise<Record<string, string>> {
    checkVersion(target);
    if (against) checkVersion(against);
    const revisions = against ? [against, target] : [target];
    const command = against ? ['diff'] : ['diff-tree', '--root', '--no-commit-id', '-r'];
    const names = (
      await git.run(root, [...command, '--name-only', ...revisions, '--'])
    ).stdout.trim();
    const result: Record<string, string> = {};
    for (const name of names.split('\n').filter(Boolean)) {
      result[name] = (
        await git.run(root, [...command, '-p', '--no-ext-diff', ...revisions, '--', name])
      ).stdout;
    }
    return result;
  }
  function settings(): WorkbenchSettings {
    try {
      const value = JSON.parse(readFileSync(join(root, 'settings.json'), 'utf8'));
      validateAccessDocument('settingsFile', value);
      return { ...value, session: { idleHours: 8, absoluteHours: 24, ...value.session } };
    } catch (error) {
      throw new AdminConfigError(`settings.json: ${(error as Error).message}`);
    }
  }
  return {
    settings,
    ensure,
    load: () => validate(readFiles()),
    version,
    write,
    history,
    diff,
    rollback,
  };
}
/** The administration repository of one data root. */
export type AdminRepository = ReturnType<typeof openAdminRepository>;
