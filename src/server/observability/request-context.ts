// Carries the id of the current request, and the pseudonym of whoever sent it, to every log line
// written while the request is handled, however deep in the code.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes } from 'node:crypto';

/** What is known about the request being handled. */
export type RequestContext = { requestId: string; actor?: string };

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs work with a request context, which log lines inside it pick up. */
export function runInRequest<T>(context: RequestContext, work: () => T): T {
  return storage.run(context, work);
}

/** The context of the request being handled, if the code runs inside one. */
export function currentRequest(): RequestContext | undefined {
  return storage.getStore();
}

/** Records the actor once the request has been tied to a person or client. */
export function setRequestActor(actor: string): void {
  const context = storage.getStore();
  if (context) context.actor = actor;
}

let actorSalt: Buffer = randomBytes(16);

/**
 * Sets the secret that makes actor pseudonyms unlinkable to the identity provider's ids. Without
 * a configured value each start uses a new one, so pseudonyms still tie a person's requests
 * together within one run and nothing more.
 */
export function configureActorSalt(salt: string | null): void {
  actorSalt = salt ? Buffer.from(salt, 'utf8') : randomBytes(16);
}

/** The identity facts a pseudonym is made from. */
export type ActorIdentity = { kind: 'person' | 'client' | 'local' | 'anonymous'; key?: string };

/**
 * The only form in which a person appears in logs and telemetry: a keyed hash of the stable
 * principal key. It is not reversible without the salt, and it holds no name or address.
 */
export function actorPseudonym(identity: ActorIdentity): string {
  if (identity.kind === 'local') return 'local';
  if (identity.kind === 'anonymous' || !identity.key) return 'anonymous';
  const digest = createHmac('sha256', actorSalt).update(identity.key).digest('hex');
  return `${identity.kind === 'client' ? 'client' : 'user'}-${digest.slice(0, 16)}`;
}
