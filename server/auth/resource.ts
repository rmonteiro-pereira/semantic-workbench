// Owns resource identities and validates file paths before policy matching.
import { posix } from 'node:path';
import type { Level } from './actions';

/** A resource identity and the file attributes relevant to policy evaluation. */
export type ResourceRef =
  | { type: 'workspace' }
  | { type: 'project'; project: string; domain?: string }
  | {
      type: 'file';
      project: string;
      path: string;
      docType?: string;
      level?: Level;
      metric?: { name: string; status: string; owner?: string };
      /** Only for a file of a project being created: the domain the project will have. */
      domain?: string;
    };
/**
 * Stands for a project that a creation request has not made yet. Project slugs hold only
 * lowercase letters, digits and hyphens, so no real project can carry this name.
 */
export const NEW_PROJECT = '(new project)';

/** The project a person asks to create in a domain, as the policies see it before it exists. */
export function newProjectIn(domain: string): Extract<ResourceRef, { type: 'project' }> {
  return { type: 'project', project: NEW_PROJECT, domain };
}
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
  hour?: number;
  sourceIp?: string;
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
