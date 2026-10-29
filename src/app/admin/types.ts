import type { Grant, Role, ProjectsConfig, AgentsConfig } from '../../server/auth/access-config';
import type { Action } from '../../shared/auth/actions';
import type { AdminRule, PolicyTemplate } from '../../server/auth/policies';

export type { Grant, Role, ProjectsConfig, AgentsConfig, AdminRule, PolicyTemplate };
/** A persisted policy and its editor metadata. */
export type Policy = {
  id: string;
  text: string;
  enabled: boolean;
  description: string;
  template?: string;
};
/** User-facing provenance of an effective role. */
export type RoleSource = {
  roleId: string;
  scope: Grant['scope'];
  via: 'group' | 'email' | 'bootstrap';
  group?: { id: string; name?: string };
};
/** An identity seen by the server, without provider credentials. */
export type AdminUser = {
  id: string;
  name: string;
  kind: string;
  verifiedEmail: string | null;
  /** Null for agent clients, which never sign in interactively. */
  lastSignInAt: string | null;
  groups: { id: string; displayName: string | null; resolved: boolean }[];
  roleSources: RoleSource[];
  access: 'granted' | 'none';
  deactivated: boolean;
};
/** Built-in and custom role inventory with deletion impact. */
export type RolesResponse = {
  builtIn: Role[];
  custom: Role[];
  actions: Action[];
  conditions: string[];
  /** How many grants use each role and how many known people hold it. */
  usage: Record<string, { grants: number; people: number }>;
};
/** A reviewed proposal, including the changed decisions and people. */
export type DryRun = {
  dryRunId: string;
  changed: { case: string; before: unknown; after: unknown; rules: string[] }[];
  matrixCases: number;
  auditCases: number;
  people: {
    principal: string;
    /** Display name of the person or client; the identifier when none is known. */
    name: string;
    project: string;
    gained: string[];
    lost: string[];
    access: string;
  }[];
};
/** Administration commit metadata. */
export type Version = {
  version: string;
  author: string;
  at: string;
  message: string;
  files: string[];
};
/** Source text on each side of a version comparison. */
export type VersionDiff = { file: string; before: string; after: string };
/** Safe editable session and remote credential settings. */
export type Settings = {
  session: { idleHours: number; absoluteHours: number };
  remote: {
    allowedHosts: string[];
    azureDevOpsObo: boolean;
    github: { host: string; appConfigured: boolean };
  };
  audit: { retentionDays: number };
};
/** Public provider health and configuration. */
export type Provider = {
  issuer: string | null;
  clientId: string | null;
  discovery: string;
  groupClaimMode: string;
  overage: string;
  /** Null until the signing keys have been fetched once by this server process. */
  jwksRefreshedAt: string | null;
};
/** Session metadata that can be shown without revealing session identifiers or tokens. */
export type Session = {
  principal: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
};
/** Explanation returned by the access boundary. */
export type AccessExplanation = {
  decision: unknown;
  grants: { grantId: string; roleId: string; via: string }[];
  roles: string[];
  rules: string[];
  attributes: Record<string, unknown>;
};
/** Audit records exposed to administrators and scoped Stewards. */
export type AuditEntry = {
  at: string;
  requestId: string;
  principal: { id: string; name?: string };
  action: string;
  resource: Record<string, string>;
  decision: string;
  /** Recorded for changes and refusals; plain read decisions have none. */
  outcome?: string;
  rules: string[];
};
/** One page of filtered audit records. */
export type AuditPage = { entries: AuditEntry[]; next: string | null };
/** Proposal payloads accepted by the shared dry-run route. */
export type Proposal = { roles: Role[] } | { grants: Grant[] } | ProjectsConfig | AgentsConfig | { rules: Policy[] } | { rollbackTo: string };
/** Administration files that require review before activation. */
export type AccessArea = 'roles' | 'grants' | 'projects' | 'agents' | 'policies';
