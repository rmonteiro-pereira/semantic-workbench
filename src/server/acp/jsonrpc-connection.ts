// One JSON-RPC conversation with the agent: request ids, pending replies, size cap and schema refusal. It never decides what a method means.
import { matchesDefinition, type FrameDefinition } from './protocol-schema';

/** Largest single frame, in bytes. */
export const MAXIMUM_FRAME_BYTES = 1_048_576;

/** Standard JSON-RPC error codes the connection answers with. */
export const RPC_ERROR = { invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

/** What a handler throws to answer a request with an error instead of a result. */
export class JsonRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'JsonRpcError';
  }
}

/** A frame the connection refused, named so the session can decide what follows. */
export type Violation = 'too-large' | 'not-json' | 'batch' | 'not-jsonrpc' | 'schema' | 'unmatched-reply' | 'duplicate-id' | 'duplicate-reply';

type RequestId = string | number;
type Pending = { resolve(value: unknown): void; reject(error: Error): void; result: FrameDefinition };

/** What the connection needs from its owner. */
export type JsonRpcOptions = {
  /** Sends one message toward the agent. */
  send(message: Record<string, unknown>): void;
  /** Answers a request from the agent with a result, or throws `JsonRpcError`. */
  handleRequest(method: string, params: unknown): Promise<unknown>;
  handleNotification(method: string, params: unknown): void;
  onViolation(violation: Violation): void;
  /** Definition that the params of each incoming method must match. A method not listed is passed on without a check. */
  paramSchemas: Readonly<Record<string, FrameDefinition>>;
  maximumFrameBytes?: number;
};

function isId(value: unknown): value is RequestId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value));
}

/** Creates the connection. Frames arrive through `receive`; requests to the agent go through `request`. */
export function createJsonRpcConnection(options: JsonRpcOptions) {
  const maximumBytes = options.maximumFrameBytes ?? MAXIMUM_FRAME_BYTES;
  const pending = new Map<RequestId, Pending>();
  const answered = new Set<RequestId>();
  const inFlightFromAgent = new Set<RequestId>();
  let nextId = 1;
  let closed = false;

  function reply(id: RequestId, body: { result: unknown } | { error: { code: number; message: string } }): void {
    if (!closed) options.send({ jsonrpc: '2.0', id, ...body });
  }

  async function serveRequest(id: RequestId, method: string, params: unknown): Promise<void> {
    const definition = options.paramSchemas[method];
    if (definition && !matchesDefinition(definition, params)) {
      options.onViolation('schema');
      inFlightFromAgent.delete(id);
      reply(id, { error: { code: RPC_ERROR.invalidParams, message: 'Invalid params.' } });
      return;
    }
    try {
      reply(id, { result: await options.handleRequest(method, params) });
    } catch (error) {
      if (error instanceof JsonRpcError) reply(id, { error: { code: error.code, message: error.message } });
      else reply(id, { error: { code: RPC_ERROR.internal, message: 'Internal error.' } });
    } finally {
      inFlightFromAgent.delete(id);
    }
  }

  function acceptReply(id: RequestId, message: Record<string, unknown>): void {
    const waiting = pending.get(id);
    if (!waiting) {
      options.onViolation(answered.has(id) ? 'duplicate-reply' : 'unmatched-reply');
      return;
    }
    pending.delete(id);
    answered.add(id);
    if (message.error && typeof message.error === 'object') {
      const { code, message: text } = message.error as { code?: unknown; message?: unknown };
      waiting.reject(new JsonRpcError(typeof code === 'number' ? code : RPC_ERROR.internal, typeof text === 'string' ? text : 'The agent reported an error.'));
      return;
    }
    if (!matchesDefinition(waiting.result, message.result)) {
      options.onViolation('schema');
      waiting.reject(new JsonRpcError(RPC_ERROR.invalidParams, 'The agent answered with a frame that does not match the protocol.'));
      return;
    }
    waiting.resolve(message.result);
  }

  return {
    /** Accepts one frame of text from the agent. */
    receive(text: string): void {
      if (closed) return;
      if (Buffer.byteLength(text) > maximumBytes) return options.onViolation('too-large');
      let message: unknown;
      try {
        message = JSON.parse(text);
      } catch {
        return options.onViolation('not-json');
      }
      if (Array.isArray(message)) return options.onViolation('batch');
      if (!message || typeof message !== 'object' || (message as { jsonrpc?: unknown }).jsonrpc !== '2.0') return options.onViolation('not-jsonrpc');
      const frame = message as Record<string, unknown>;
      const hasMethod = typeof frame.method === 'string';
      if (hasMethod && frame.id === undefined) {
        const definition = options.paramSchemas[frame.method as string];
        if (definition && !matchesDefinition(definition, frame.params)) return options.onViolation('schema');
        return options.handleNotification(frame.method as string, frame.params);
      }
      if (!isId(frame.id)) return options.onViolation('not-jsonrpc');
      if (hasMethod) {
        if (inFlightFromAgent.has(frame.id)) return options.onViolation('duplicate-id');
        inFlightFromAgent.add(frame.id);
        void serveRequest(frame.id, frame.method as string, frame.params);
        return;
      }
      acceptReply(frame.id, frame);
    },
    /** Sends a request to the agent and waits for its reply, which must match `result`. There is deliberately no timeout: a model turn has no fixed length. */
    request<T = unknown>(method: string, params: Record<string, unknown>, result: FrameDefinition): Promise<T> {
      if (closed) return Promise.reject(new Error('The conversation has ended.'));
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject, result });
        options.send({ jsonrpc: '2.0', id, method, params });
      });
    },
    notify(method: string, params: Record<string, unknown>): void {
      if (!closed) options.send({ jsonrpc: '2.0', method, params });
    },
    /** Ends the conversation: every waiting request fails and nothing more is sent or accepted. */
    close(): void {
      closed = true;
      for (const waiting of pending.values()) waiting.reject(new Error('The conversation has ended.'));
      pending.clear();
    },
    get pendingCount(): number {
      return pending.size;
    },
  };
}

export type JsonRpcConnection = ReturnType<typeof createJsonRpcConnection>;
