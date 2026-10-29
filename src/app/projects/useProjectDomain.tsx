// Keeps domain selection inside the component that owns a creation flow.
import { useState } from 'react';
import { useMe } from '../auth/useMe';
import { ProjectDomainDialog } from './ProjectDialogs';

/** Offers server-provided choices before the caller sends its creation request. */
export function useProjectDomain() {
  const { me } = useMe();
  const [pending, setPending] = useState<{
    resolve: (domain: string | undefined) => void;
    reject: (error: Error) => void;
  } | null>(null);
  function choose(): Promise<string | undefined> {
    if (!me) return Promise.reject(new Error('Identity unavailable'));
    const choices = (me.creationDomains?.length ?? 0) + Number(Boolean(me.can?.admin));
    if (me.mode === 'local' || choices <= 1) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => setPending({ resolve, reject }));
  }
  function accept(domain: string | undefined) {
    pending?.resolve(domain);
    setPending(null);
  }
  function cancel() {
    pending?.reject(new Error('Project creation cancelled.'));
    setPending(null);
  }
  const dialog = pending && <ProjectDomainDialog domains={me?.creationDomains ?? []} allowUnassigned={me?.can?.admin ?? false} onChoose={accept} onClose={cancel} />;
  return { choose, dialog };
}
