// Owns resource identities and validates file paths before policy matching.
import { posix } from 'node:path';
import type { Level } from './actions';

/** A resource identity and the file attributes relevant to policy evaluation. */
export type ResourceRef =
  | { type: 'workspace' }
  | { type: 'project'; project: string }
  | {
      type: 'file';
      project: string;
      path: string;
      docType?: string;
      level?: Level;
      metric?: { name: string; status: string; owner?: string };
    };
/** A policy decision with deciding rule ids and existence-hiding HTTP status. */
export type Decision = {
  allow: boolean;
  rules: string[];
  reason?: string;
  status: 200 | 403 | 404;
};
/** Complete context passed to Cedar after request defaults have been applied. */
export type DecisionContext = {
  mode: 'local' | 'server';
  branch: string;
  protectedBranch: boolean;
  level: number;
  guardKind: string;
};
/** A resource path that cannot safely identify a project file. */
export class InvalidResourceError extends Error {
  constructor(path: string) {
    super(`Invalid resource path: ${JSON.stringify(path)}; expected a relative POSIX file path.`);
    this.name = 'InvalidResourceError';
  }
}

/** Normalizes file paths once before any policy or memo key can inspect them. */
export function normalizeResource(resource: ResourceRef): ResourceRef {
  if (resource.type !== 'file') return resource;
  const path = resource.path;
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) {
    throw new InvalidResourceError(path);
  }
  const normalized = posix.normalize(path);
  if (normalized === '.' || normalized === './') throw new InvalidResourceError(path);
  return { ...resource, path: normalized };
}
