// Server-mode handlers always need a remote credential service. Tests that are not about remote
// credentials use this one: it accepts every address as given and hands Git no credential, so
// their local bare repositories keep working as remotes.
import type { RemoteCredentials } from '../../server/auth/remote-credentials';

/** A credential service that allows every remote and gives every command no credential. */
export function allowEveryRemote(): RemoteCredentials {
  return {
    checkHost: address => ({ host: '', address: address as string }),
    checkRemote: () => '',
    credentialFor: async () => ({ kind: 'none' }),
    status: async () => ({
      connected: { azureDevOps: false, github: false },
      azureDevOpsAvailable: false,
      githubConfigured: false,
    }),
    startGitHub: async () => null,
    finishGitHub: async () => ({ returnTo: '/', connected: false }),
  };
}
