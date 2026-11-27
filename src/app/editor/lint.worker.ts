/** Runs document and SQL validation off the main thread, loading SQL grammars only when needed. */
import { lintReply, type LintRequest } from './lintRequest';
// Shared validation rules off the main thread: typing never waits for a parse. SQL inside
// definitions is linted here too: warnings with exact positions, grammar builds loaded on first
// need. Every request is answered, so the main thread never waits on a lost reply.
self.onmessage = async (event: MessageEvent<LintRequest>) => {
  (self as any).postMessage(await lintReply(event.data));
};
