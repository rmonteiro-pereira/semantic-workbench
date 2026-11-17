// Durable receipts that make delete, restore and commit safe to retry. A receipt is written before the effect and completed after it, so a retry after a crash or a lost answer gets the original result, or an honest "uncertain", and never a second effect. File text is never stored.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson } from '../projects/atomic';
import { fail, type ToolResult } from './tool-results';

/** How long a receipt answers a retry. No requirement names a value, so a week covers an agent that comes back the next working day. */
export const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type ReceiptState = 'pending' | 'done' | 'uncertain';
type Receipt = { id: string; principalId: string; tool: string; argumentsHash: string; state: ReceiptState; result?: ToolResult; createdAt: string; expiresAt: string };

/** What to do with one call, given what the store already knows about its key. */
export type ReceiptRequest = {
  principalId: string;
  tool: string;
  idempotencyKey: string;
  /** The tool's arguments. The key itself is left out of the comparison. */
  args: Record<string, unknown>;
  /** Runs the effect once. */
  effect: () => Promise<ToolResult>;
  /** After a restart left a receipt pending, reports the effect's result when it can be shown to have happened, and null when it cannot. */
  verify: () => Promise<ToolResult | null>;
};

export type ReceiptStore = {
  run(request: ReceiptRequest): Promise<ToolResult>;
  /** Removes receipts past their retention. */
  prune(): void;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The hash a retry must reproduce: the arguments with sorted keys and without the idempotency key. */
export function argumentsHash(args: Record<string, unknown>): string {
  const { idempotencyKey: _key, ...rest } = args;
  return sha256(JSON.stringify(canonical(rest)));
}

/** Opens the receipt store under a state folder. Month files hold receipts keyed by id and are rewritten atomically. */
export function createReceiptStore(directory: string, now: () => Date = () => new Date()): ReceiptStore {
  const inFlight = new Set<string>();
  function fileFor(createdAt: string) {
    return join(directory, `${createdAt.slice(0, 7)}.json`);
  }
  function readMonth(file: string): Record<string, Receipt> {
    if (!existsSync(file)) return {};
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  }
  function find(id: string): Receipt | undefined {
    mkdirSync(directory, { recursive: true });
    for (const name of readdirSync(directory).filter(entry => entry.endsWith('.json'))) {
      const found = readMonth(join(directory, name))[id];
      if (found) return found;
    }
    return undefined;
  }
  function save(receipt: Receipt) {
    mkdirSync(directory, { recursive: true });
    const file = fileFor(receipt.createdAt);
    atomicWriteJson(file, { ...readMonth(file), [receipt.id]: receipt });
  }
  function forget(receipt: Receipt) {
    const file = fileFor(receipt.createdAt);
    const month = readMonth(file);
    delete month[receipt.id];
    if (Object.keys(month).length) atomicWriteJson(file, month);
    else rmSync(file, { force: true });
  }
  function prune() {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory).filter(entry => entry.endsWith('.json'))) {
      const file = join(directory, name);
      const month = readMonth(file);
      const kept = Object.fromEntries(Object.entries(month).filter(([, receipt]) => receipt.expiresAt > now().toISOString()));
      if (Object.keys(kept).length === Object.keys(month).length) continue;
      if (Object.keys(kept).length) atomicWriteJson(file, kept);
      else rmSync(file, { force: true });
    }
  }
  async function afterRestart(receipt: Receipt, request: ReceiptRequest): Promise<ToolResult> {
    const verified = await request.verify();
    save({ ...receipt, state: verified ? 'done' : 'uncertain', ...(verified ? { result: verified } : {}) });
    return verified ?? fail('uncertain', 'The earlier attempt may or may not have completed. Read the current state before trying again.');
  }
  return {
    prune,
    async run(request) {
      const id = sha256(`${request.principalId}\n${request.tool}\n${request.idempotencyKey}`);
      const hash = argumentsHash(request.args);
      const existing = find(id);
      if (existing && existing.argumentsHash !== hash) return fail('key_reused', 'This idempotency key was already used with different arguments. Use a new key for a new request.');
      if (existing?.state === 'done' && existing.result) return existing.result;
      if (existing?.state === 'uncertain') return fail('uncertain', 'The earlier attempt may or may not have completed. Read the current state before trying again.');
      if (existing?.state === 'pending') {
        if (inFlight.has(id)) return fail('rate_limited', 'The first attempt with this key is still running.', { retryAfterSeconds: 1 });
        return afterRestart(existing, request);
      }
      const created = now().toISOString();
      const receipt: Receipt = { id, principalId: request.principalId, tool: request.tool, argumentsHash: hash, state: 'pending', createdAt: created, expiresAt: new Date(now().getTime() + RECEIPT_RETENTION_MS).toISOString() };
      save(receipt);
      inFlight.add(id);
      try {
        const result = await request.effect();
        // A refusal left nothing behind, so the key stays usable for a corrected retry.
        if (result.ok) save({ ...receipt, state: 'done', result });
        else forget(receipt);
        return result;
      } finally {
        inFlight.delete(id);
      }
    },
  };
}
