// Durable receipts that make delete, restore and commit safe to retry. A receipt is written before the effect and completed after it, so a retry after a crash or a lost answer gets the original result, or an honest "uncertain", and never a second effect. File text is never stored.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../observability/log';
import { atomicWriteJson } from '../projects/atomic';
import { fail, type ToolResult } from './tool-results';

/** How long a receipt answers a retry. No requirement names a value, so a week covers an agent that comes back the next working day. */
export const RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type ReceiptState = 'pending' | 'done' | 'uncertain';
type Receipt = { note?: Record<string, unknown>; id: string; principalId: string; tool: string; argumentsHash: string; state: ReceiptState; result?: ToolResult; createdAt: string; expiresAt: string };

/** What to do with one call, given what the store already knows about its key. */
export type ReceiptRequest = {
  principalId: string;
  tool: string;
  idempotencyKey: string;
  /** The tool's arguments. The key itself is left out of the comparison. */
  args: Record<string, unknown>;
  /** Reads what verification will need from the state before the effect, such as the project and path of a trash entry. A failure ends the call. */
  prepare?: () => Promise<Record<string, unknown> | ToolResult>;
  /** Runs the effect once. */
  effect: () => Promise<ToolResult>;
  /** After a restart left a receipt pending, reports the effect's result when it can be shown to have happened, and null when it cannot. */
  verify: (note: Record<string, unknown>) => Promise<ToolResult | null>;
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
  // The arguments hash of each call that is running, by receipt id, so a second call with the key is answered before it reads or prepares anything.
  const inFlight = new Map<string, string>();
  function fileFor(createdAt: string) {
    return join(directory, `${createdAt.slice(0, 7)}.json`);
  }
  /** A month file that cannot be parsed is moved aside for a person to inspect, and the month starts empty. */
  function readMonth(file: string): { receipts: Record<string, Receipt>; corrupt: boolean } {
    if (!existsSync(file)) return { receipts: {}, corrupt: false };
    try {
      return { receipts: JSON.parse(readFileSync(file, 'utf8')), corrupt: false };
    } catch {
      const aside = `${file}.corrupt-${now().getTime()}`;
      renameSync(file, aside);
      log.warn('mcp.receipts-corrupt', { file, movedTo: aside });
      return { receipts: {}, corrupt: true };
    }
  }
  /** Whether a month file was moved aside within the retention period, so keys it held may have been used. */
  function recentlyCorrupted(): boolean {
    const oldest = now().getTime() - RECEIPT_RETENTION_MS;
    return readdirSync(directory).some(entry => {
      const moved = entry.match(/\.json\.corrupt-(\d+)$/);
      return moved !== null && Number(moved[1]) > oldest;
    });
  }
  /** An expired receipt is absent. While a corrupt month file is recent, any key not found may have been used, which only "uncertain" answers honestly. */
  function find(id: string): Receipt | 'corrupt' | undefined {
    mkdirSync(directory, { recursive: true });
    for (const name of readdirSync(directory).filter(entry => entry.endsWith('.json'))) {
      const found = readMonth(join(directory, name)).receipts[id];
      if (found && found.expiresAt > now().toISOString()) return found;
    }
    return recentlyCorrupted() ? 'corrupt' : undefined;
  }
  function save(receipt: Receipt) {
    mkdirSync(directory, { recursive: true });
    const file = fileFor(receipt.createdAt);
    atomicWriteJson(file, { ...readMonth(file).receipts, [receipt.id]: receipt });
  }
  function forget(receipt: Receipt) {
    const file = fileFor(receipt.createdAt);
    const month = readMonth(file).receipts;
    // A newer receipt under the same id is not this call's to remove.
    if (month[receipt.id]?.createdAt !== receipt.createdAt) return;
    delete month[receipt.id];
    if (Object.keys(month).length) atomicWriteJson(file, month);
    else rmSync(file, { force: true });
  }
  function prune() {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory).filter(entry => entry.endsWith('.json'))) {
      const file = join(directory, name);
      const month = readMonth(file).receipts;
      const kept = Object.fromEntries(Object.entries(month).filter(([, receipt]) => receipt.expiresAt > now().toISOString()));
      if (Object.keys(kept).length === Object.keys(month).length) continue;
      if (Object.keys(kept).length) atomicWriteJson(file, kept);
      else rmSync(file, { force: true });
    }
  }
  async function afterRestart(receipt: Receipt, request: ReceiptRequest): Promise<ToolResult> {
    const verified = await request.verify(receipt.note ?? {});
    save({ ...receipt, state: verified ? 'done' : 'uncertain', ...(verified ? { result: verified } : {}) });
    return verified ?? fail('uncertain', 'The earlier attempt may or may not have completed. Read the current state before trying again.');
  }
  async function runOnce(request: ReceiptRequest, id: string, hash: string): Promise<ToolResult> {
    const existing = find(id);
    if (existing === 'corrupt') return fail('uncertain', 'The record of earlier attempts could not be read, so this key may have been used. Read the current state before trying again.');
    if (existing && existing.argumentsHash !== hash) return fail('key_reused', 'This idempotency key was already used with different arguments. Use a new key for a new request.');
    if (existing?.state === 'done' && existing.result) return existing.result;
    if (existing?.state === 'uncertain') return fail('uncertain', 'The earlier attempt may or may not have completed. Read the current state before trying again.');
    if (existing?.state === 'pending') return afterRestart(existing, request);
    const prepared = request.prepare ? await request.prepare() : {};
    if ('ok' in prepared && typeof prepared.ok === 'boolean') return prepared as ToolResult;
    const created = now().toISOString();
    const receipt: Receipt = {
      note: prepared,
      id,
      principalId: request.principalId,
      tool: request.tool,
      argumentsHash: hash,
      state: 'pending',
      createdAt: created,
      expiresAt: new Date(now().getTime() + RECEIPT_RETENTION_MS).toISOString(),
    };
    save(receipt);
    const result = await request.effect();
    // A refusal left nothing behind, so the key stays usable for a corrected retry.
    if (result.ok) save({ ...receipt, state: 'done', result });
    else forget(receipt);
    return result;
  }
  prune();
  return {
    prune,
    async run(request) {
      const id = sha256(`${request.principalId}\n${request.tool}\n${request.idempotencyKey}`);
      const hash = argumentsHash(request.args);
      const running = inFlight.get(id);
      if (running !== undefined) {
        if (running !== hash) return fail('key_reused', 'This idempotency key was already used with different arguments. Use a new key for a new request.');
        return fail('rate_limited', 'The first attempt with this key is still running.', { retryAfterSeconds: 1 });
      }
      inFlight.set(id, hash);
      try {
        return await runOnce(request, id, hash);
      } finally {
        inFlight.delete(id);
      }
    },
  };
}
