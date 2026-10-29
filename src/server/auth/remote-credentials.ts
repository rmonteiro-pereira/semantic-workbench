// Gives each remote Git command of server mode the signed-in person's own credential, and decides
// which remote hosts server mode may reach at all.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ServerConfig } from '../config';
import { AZURE_DEVOPS_HOSTS, allowedRemoteAddresses, allowedRemoteHost, credentialKind } from './remote-hosts';
import { githubOAuth } from './github-oauth';
import type { RemoteAddresses, RemoteCredential } from '../projects/git';
import type { WorkbenchSettings } from './admin-repo';
import { safeReturnTo } from './attempts';
import type { SignInProvider } from './sign-in-provider';
import type { RemoteTokens, Session, SessionStore } from './sessions';
import type { Workspace } from '../projects/workspace';
import type { CredentialFor } from '../projects/scm';
import { locationOf } from '../projects/paths';
import { requestRemote, type AccessRequest } from './request-scope';
import { BadRequestError } from '../projects/errors';

/** The Azure DevOps resource whose token Git accepts in place of a password. */
export const AZURE_DEVOPS_SCOPE = '499b84ac-1321-427f-aa17-267ca6975798/.default';
// A token this close to its expiry is renewed first, so a long push does not start with it.
const EXPIRY_MARGIN_MS = 60_000;
const GITHUB_ATTEMPT_MS = 10 * 60_000;

/** The person must connect an account, or sign in again, before the remote command can run. */
export class ConnectRequiredError extends Error {
  constructor(
    readonly connect: 'github' | 'azure-devops',
    options?: ErrorOptions,
  ) {
    super(connect === 'github' ? 'Connect your GitHub account to continue.' : 'Sign in again so the workbench can reach Azure DevOps on your behalf.', options);
    this.name = 'ConnectRequiredError';
  }
}

/** A GitHub token stored in the session. */
type StoredGitHub = NonNullable<RemoteTokens['github']>;

// Valid long enough for a whole command, or without an expiry at all (an OAuth app token).
function githubFresh(stored: StoredGitHub, now: number) {
  return !stored.expiresAt || stored.expiresAt - EXPIRY_MARGIN_MS > now;
}

/**
 * Whether a stored GitHub token can serve the configured host now: still fresh, or renewable
 * with its refresh token. An expired token without one is of no use.
 */
export function githubUsable(stored: StoredGitHub | undefined, host: string, now: number) {
  if (!stored || stored.host !== host) return false;
  return githubFresh(stored, now) || Boolean(stored.refreshToken);
}

function sameText(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

/** Options a test or a special deployment may change. */
export type RemoteCredentialOptions = {
  /** Hosts treated as Azure DevOps; defaults to Azure DevOps Services. */
  azureDevOpsHosts?: string[];
  fetch?: typeof fetch;
  now?: () => number;
};

/** What the delegated-credential service needs from the rest of server authentication. */
export type RemoteCredentialDependencies = RemoteCredentialOptions & {
  config: ServerConfig;
  client: Pick<SignInProvider, 'onBehalfOf'>;
  session: (request: Request) => Promise<Session | null>;
  sessions: Pick<SessionStore, 'updateRemote'>;
  settings: () => WorkbenchSettings;
  /** Records a failure without its secrets. */
  log: (message: string) => void;
};

/**
 * Applies a change to the latest remote tokens of the session, under the session's own lock, so
 * two requests that each obtain a token keep both. Refuses an ended session.
 */
type SaveRemote = (session: Session, change: (remote: RemoteTokens) => RemoteTokens) => Promise<void>;

// Forgets a GitHub token unless another request of the session has already replaced it.
function withoutGitHub(remote: RemoteTokens, token: string): RemoteTokens {
  if (remote.github?.token !== token) return remote;
  const { github: _forgotten, ...rest } = remote;
  return rest;
}

function withoutAttempt(remote: RemoteTokens): RemoteTokens {
  const { githubAttempt: _used, ...rest } = remote;
  return rest;
}

/** Creates the per-person credential service of server mode. */
export function createRemoteCredentials(deps: RemoteCredentialDependencies) {
  const now = deps.now ?? Date.now;
  const azureDevOpsHosts = deps.azureDevOpsHosts ?? AZURE_DEVOPS_HOSTS;
  const github = deps.config.github;
  const allowedHosts = () => deps.settings().remote?.allowedHosts ?? [];
  const save: SaveRemote = async (session, change) => {
    const remote = await deps.sessions.updateRemote(session.id, change);
    if (!remote) throw new BadRequestError('The session has ended.');
    session.remote = remote;
  };
  const azureDevOps = azureDevOpsAccount(deps, save, now);
  const githubAccount = gitHubAccount(deps, save, now);
  return {
    /** Refuses an address server mode may not reach; returns its host and canonical form. */
    checkHost: (address: unknown) => allowedRemoteHost(address, allowedHosts()),
    /** Refuses a remote whose fetch or push address server mode may not reach. */
    checkRemote: (remote: RemoteAddresses) => allowedRemoteAddresses(remote, allowedHosts()),
    /** The credential the signed-in person's next command to this host uses. */
    async credentialFor(request: Request, host: string): Promise<RemoteCredential> {
      const kind = credentialKind(host, {
        github: github?.host ?? null,
        azureDevOps: azureDevOpsHosts,
      });
      if (kind === 'none') return { kind: 'none' };
      const session = await deps.session(request);
      // A request without a session cannot hold any delegated token; signing in again gives one.
      if (!session) throw new ConnectRequiredError(kind);
      if (kind === 'azure-devops') {
        const token = await azureDevOps.token(session);
        return { kind: 'token', username: 'workbench', token, host };
      }
      const token = await githubAccount.token(session);
      return { kind: 'token', username: 'x-access-token', token, host };
    },
    /** Which accounts the person can use now; never the tokens themselves. */
    async status(request: Request) {
      const session = await deps.session(request);
      return {
        connected: {
          azureDevOps: Boolean(session && azureDevOps.cached(session)),
          github: Boolean(github && githubUsable(session?.remote?.github, github.host, now())),
        },
        azureDevOpsAvailable: azureDevOps.enabled(),
        githubConfigured: github !== null,
      };
    },
    startGitHub: githubAccount.startConsent,
    finishGitHub: githubAccount.finishConsent,
  };
}

// Tokens for Azure DevOps come from the provider on the person's behalf and are reused until
// shortly before they expire.
function azureDevOpsAccount(deps: RemoteCredentialDependencies, save: SaveRemote, now: () => number) {
  const enabled = () => deps.config.adoOnBehalfOf && deps.settings().remote?.azureDevOpsObo === true;
  // A token obtained earlier in the session that is still valid for a whole command.
  function cached(session: Session) {
    const stored = session.remote?.azureDevOps;
    if (stored?.expiresAt && stored.expiresAt - EXPIRY_MARGIN_MS > now()) return stored.token;
    return null;
  }
  async function token(session: Session) {
    // Checked first, so turning the feature off stops tokens already obtained as well.
    if (!enabled()) {
      throw new BadRequestError('Azure DevOps access on your behalf is turned off on this server.');
    }
    const reused = cached(session);
    if (reused) return reused;
    let issued;
    try {
      issued = await deps.client.onBehalfOf(session.tokens.accessToken, [AZURE_DEVOPS_SCOPE]);
    } catch (error) {
      deps.log(`azure-devops-on-behalf-of-failed ${(error as Error).name}`);
      throw new ConnectRequiredError('azure-devops', { cause: error });
    }
    await save(session, remote => ({ ...remote, azureDevOps: issued }));
    return issued.token;
  }
  return { enabled, cached, token };
}

// Tokens for GitHub come from the person's own consent through Connect GitHub; an expiring
// GitHub App token is renewed with its refresh token.
function gitHubAccount(deps: RemoteCredentialDependencies, save: SaveRemote, now: () => number) {
  const app = deps.config.github;
  const oauth = githubOAuth({ publicUrl: deps.config.publicUrl, now, fetch: deps.fetch });
  // A GitHub App refresh token works once, so concurrent requests of one session share a renewal.
  const renewing = new Map<string, Promise<string>>();
  async function renew(session: Session, expired: { token: string; refreshToken: string }) {
    try {
      const renewed = await oauth.request(app!, {
        grant_type: 'refresh_token',
        refresh_token: expired.refreshToken,
      });
      await save(session, remote => ({ ...remote, github: renewed }));
      return renewed.token;
    } catch (error) {
      deps.log(`github-refresh-failed ${(error as Error).message}`);
      await save(session, remote => withoutGitHub(remote, expired.token));
      throw new ConnectRequiredError('github', { cause: error });
    }
  }
  async function token(session: Session) {
    const stored = session.remote?.github;
    if (!app || !stored || !githubUsable(stored, app.host, now())) {
      if (stored) await save(session, remote => withoutGitHub(remote, stored.token));
      throw new ConnectRequiredError('github');
    }
    if (githubFresh(stored, now())) return stored.token;
    const refreshToken = stored.refreshToken!;
    let pending = renewing.get(session.id);
    if (!pending) {
      pending = renew(session, { token: stored.token, refreshToken }).finally(() => renewing.delete(session.id));
      renewing.set(session.id, pending);
    }
    return pending;
  }
  /** Starts the consent of this session and returns the address to send the browser to. */
  async function startConsent(session: Session, returnTo: string | null) {
    if (!app) return null;
    const state = randomBytes(32).toString('base64url');
    const attempt = {
      state,
      returnTo: safeReturnTo(returnTo),
      expiresAt: now() + GITHUB_ATTEMPT_MS,
    };
    await save(session, remote => ({ ...remote, githubAttempt: attempt }));
    return oauth.authorizeUrl(app, state);
  }
  /**
   * Completes the consent with the code GitHub returned. The attempt is used once, whatever the
   * outcome; a state from another session or an expired attempt is refused.
   */
  async function finishConsent(session: Session, params: URLSearchParams) {
    // Taking the attempt and clearing it is one step, so two callbacks cannot both use it.
    let attempt: RemoteTokens['githubAttempt'];
    await save(session, remote => {
      attempt = remote.githubAttempt;
      return withoutAttempt(remote);
    });
    const returnTo = attempt?.returnTo ?? '/';
    const code = params.get('code');
    const matches = attempt !== undefined && attempt.expiresAt > now() && sameText(attempt.state, params.get('state') ?? '');
    if (!app || !code || !matches) return { returnTo, connected: false };
    try {
      const github = await oauth.request(app, {
        code,
        redirect_uri: deps.config.publicUrl + '/auth/github/callback',
      });
      await save(session, remote => ({ ...remote, github }));
      return { returnTo, connected: true };
    } catch (error) {
      deps.log(`github-connect-failed ${(error as Error).message}`);
      return { returnTo, connected: false };
    }
  }
  return { token, startConsent, finishConsent };
}

/** The credential service of server mode. */
export type RemoteCredentials = ReturnType<typeof createRemoteCredentials>;

/**
 * The credential service of this request, or undefined in local mode, where Git keeps using the
 * machine's own credential configuration. A request the handler did not mark is refused, so a
 * server request can never fall back to the machine's credentials.
 */
export function remoteCredentialsOf(request: Request): RemoteCredentials | undefined {
  const remote = (request as AccessRequest)[requestRemote];
  if (remote === undefined) throw new Error('Request has no remote credential mode.');
  return remote === 'local' ? undefined : remote;
}

/** The address to store for a remote: canonical in server mode, as given in local mode. */
export function checkRemoteAddress(request: Request, address: unknown) {
  const service = remoteCredentialsOf(request);
  return service ? service.checkHost(address).address : address;
}

/**
 * Chooses the credential for whichever remote the command reaches; undefined in local mode. Both
 * addresses of that remote must be allowed and share one host.
 */
export function delegatedCredentials(request: Request): CredentialFor | undefined {
  const service = remoteCredentialsOf(request);
  if (!service) return undefined;
  return async remote => service.credentialFor(request, service.checkRemote(remote));
}

/** The credential for cloning this address, and the address to clone; local mode keeps both. */
export async function cloneCredential(request: Request, address: unknown) {
  const service = remoteCredentialsOf(request);
  if (!service) return { address, credential: undefined };
  const allowed = service.checkHost(address);
  return {
    address: allowed.address,
    credential: await service.credentialFor(request, allowed.host),
  };
}

/** Refuses registering a repository's projects while one of its remotes is not allowed. */
export async function checkRepositoryRemotes(ws: Workspace, request: Request, repo: string) {
  const service = remoteCredentialsOf(request);
  if (!service) return;
  const project = ws.state.registry().projects.find(entry => locationOf(entry).repo === repo);
  // An unknown repository is refused by the registration itself.
  if (!project) return;
  for (const remote of await ws.scm.remoteAddresses(project.slug)) service.checkRemote(remote);
}
