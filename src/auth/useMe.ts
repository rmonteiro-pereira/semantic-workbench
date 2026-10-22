// Keeps the signed-in identity in memory for this page load.
import { useEffect, useState } from 'react';
import { apiFetch } from '../projects/api';

/** Identity and effective role labels supplied by the authenticated API. */
export type Me = {
  mode: 'local' | 'server';
  id?: string;
  creationDomains?: { id: string; name: string }[];
  can?: Record<string, boolean>;
  requires?: Record<string, string>;
  name: string;
  /** Server mode only: the username the provider gave, which a metric owner may name. */
  username?: string;
  verifiedEmail: string | null;
  csrf?: string;
  roleSources?: { via: 'group' | 'email' | 'bootstrap' }[];
  roles: { workspace: string[]; projects: Record<string, string[]> };
  roleNames: Record<string, string>;
  /** Server mode: Git host accounts the person can push with now. */
  connected?: { azureDevOps: boolean; github: boolean };
  /** Server mode: Azure DevOps tokens can be obtained on the person's behalf. */
  azureDevOpsAvailable?: boolean;
  githubConfigured?: boolean;
};

let identity: Promise<Me> | undefined;

/** Shares successful identity requests and permits a retry after transient failures. */
export function loadIdentity(): Promise<Me> {
  identity ??= apiFetch('/api/me')
    .then(async response => {
      if (!response.ok) throw new Error(`Identity request failed (${response.status}).`);
      return response.json();
    })
    .catch(problem => {
      identity = undefined;
      throw problem;
    });
  return identity;
}

/** Returns distinct display names for workspace and project roles. */
export function personRoles(me: Me): string[] {
  const roles = [...me.roles.workspace, ...Object.values(me.roles.projects).flat()];
  return [...new Set(roles)].map(role => me.roleNames[role] ?? role);
}

/** Fetches the current identity once, including across development effect remounts. */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void loadIdentity().then(
      value => {
        if (active) setMe(value);
      },
      () => {
        if (active) setError('Identity unavailable');
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return { me, error };
}
