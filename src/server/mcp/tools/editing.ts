// Tools that change definitions: save by patch or text, create, delete to the trash and restore. Saving and creating rely on the save route's version check and byte preservation; delete and restore are safe to retry through receipts.
import { DEFAULT_TOOL_REQUEST_CAP_BYTES, GLOBAL_REQUEST_CAP_BYTES } from '../body-limits';
import type { ToolContext, ToolDefinition } from '../tool-definition';
import { fail, succeed, type ToolResult } from '../tool-results';
import { EDIT_ARGUMENTS, IDEMPOTENCY_KEY, PATCHES, VERSION } from './editing-arguments';

/** The most findings a save answer lists. */
const MAXIMUM_FINDINGS = 200;
const WRITE_HINTS = { readOnly: false, destructive: false, idempotent: true, openWorld: false } as const;

type Finding = { path: string; severity: string; message: string; line?: number };
type SaveAnswer = { path: string; hash: string; findings: Finding[]; demoted?: unknown; source?: string };

function summarize(findings: Finding[]) {
  return findings
    .slice(0, MAXIMUM_FINDINGS)
    .map(finding => ({ pointer: finding.path, severity: finding.severity, message: finding.message, ...(finding.line !== undefined ? { line: finding.line } : {}) }));
}

/** The answer of a store: the new version, the findings and whether a content guard changed what was stored. */
function savedResult(answer: SaveAnswer): ToolResult {
  const differs = answer.source !== undefined;
  return succeed({ version: answer.hash, findings: summarize(answer.findings), findingCount: answer.findings.length, stored: { differs, ...(differs ? { source: answer.source } : {}) } });
}

/** A conflict that says whether the file already holds the text this call proposed. */
function conflictWithComparison(failure: ToolResult, currentSource: unknown, proposed: string | undefined): ToolResult {
  if (failure.ok || failure.error.code !== 'conflict') return failure;
  return fail('conflict', failure.error.message, { ...failure.error.details, unchanged: proposed !== undefined && currentSource === proposed });
}

async function store(context: ToolContext, args: Record<string, any>, baseHash: string | null): Promise<ToolResult> {
  const body = { baseHash, ...(args.source !== undefined ? { source: args.source } : { patches: args.patches }) };
  const called = await context.twin('files.save', { params: { slug: args.project, '*': args.path }, body });
  if (called.ok) return savedResult(called.answer.body as SaveAnswer);
  const current = (called.answer?.body as { currentSource?: unknown } | undefined)?.currentSource;
  return conflictWithComparison(called.failure, current, args.source);
}

const saveFile: ToolDefinition = {
  name: 'save_file',
  description:
    'Replace a file by patches or by full text, starting from the version you read. A changed file answers conflict with the current version, and invalid text is never saved. Send exactly one of patches and source.',
  inputSchema: {
    type: 'object',
    properties: { ...EDIT_ARGUMENTS, baseVersion: VERSION, patches: PATCHES, source: { type: 'string', maxLength: 2_000_000 } },
    required: ['project', 'path', 'baseVersion'],
    oneOf: [{ required: ['patches'] }, { required: ['source'] }],
    additionalProperties: false,
  },
  hints: { ...WRITE_HINTS, destructive: true },
  operation: 'files.save',
  retryClass: 'precondition-protected',
  requestCapBytes: GLOBAL_REQUEST_CAP_BYTES,
  run: (args, context) => store(context, args, args.baseVersion),
};

const createFile: ToolDefinition = {
  name: 'create_file',
  description: 'Create a new file with the given text. An existing path answers conflict and says whether it already holds this text.',
  inputSchema: { type: 'object', properties: { ...EDIT_ARGUMENTS, source: { type: 'string', maxLength: 2_000_000 } }, required: ['project', 'path', 'source'], additionalProperties: false },
  hints: WRITE_HINTS,
  operation: 'files.save',
  retryClass: 'precondition-protected',
  requestCapBytes: GLOBAL_REQUEST_CAP_BYTES,
  run: (args, context) => store(context, args, null),
};

type TrashEntry = { entryId: string; project: string; path?: string; hash?: string };

async function trashEntries(context: ToolContext): Promise<TrashEntry[] | ToolResult> {
  const called = await context.twin('trash.list', { params: {} });
  return called.ok ? (called.answer.body as TrashEntry[]) : called.failure;
}

const deleteFile: ToolDefinition = {
  name: 'delete_file',
  description:
    'Move a file to the trash, from the version you read. The file can be restored with restore_file. Retrying with the same idempotencyKey returns the first result and never deletes twice.',
  inputSchema: {
    type: 'object',
    properties: { ...EDIT_ARGUMENTS, baseVersion: VERSION, idempotencyKey: IDEMPOTENCY_KEY },
    required: ['project', 'path', 'baseVersion', 'idempotencyKey'],
    additionalProperties: false,
  },
  hints: WRITE_HINTS,
  operation: 'files.delete',
  retryClass: 'receipt-backed',
  requestCapBytes: DEFAULT_TOOL_REQUEST_CAP_BYTES,
  run: (args, context) =>
    context.receipts.run({
      principalId: context.principalId,
      tool: 'delete_file',
      idempotencyKey: args.idempotencyKey,
      args,
      async effect() {
        const called = await context.twin('files.delete', { params: { slug: args.project, '*': args.path }, body: { confirm: true, baseHash: args.baseVersion } });
        return called.ok ? succeed({ entry: (called.answer.body as { entryId: string }).entryId }) : called.failure;
      },
      // A delete is done when the trash holds an entry for the path with the version that was named.
      async verify() {
        const entries = await trashEntries(context);
        if (!Array.isArray(entries)) return null;
        const found = entries.find(entry => entry.project === args.project && entry.path === args.path && entry.hash === args.baseVersion);
        return found ? succeed({ entry: found.entryId }) : null;
      },
    }),
};

const restoreFile: ToolDefinition = {
  name: 'restore_file',
  description: 'Restore a trashed file to its original place. It refuses to overwrite a file that exists now. Retrying with the same idempotencyKey returns the first result and never restores twice.',
  inputSchema: {
    type: 'object',
    properties: { entry: { type: 'string', minLength: 1, maxLength: 64 }, idempotencyKey: IDEMPOTENCY_KEY },
    required: ['entry', 'idempotencyKey'],
    additionalProperties: false,
  },
  hints: WRITE_HINTS,
  operation: 'trash.restore',
  retryClass: 'receipt-backed',
  requestCapBytes: DEFAULT_TOOL_REQUEST_CAP_BYTES,
  run: (args, context) =>
    context.receipts.run({
      principalId: context.principalId,
      tool: 'restore_file',
      idempotencyKey: args.idempotencyKey,
      args,
      // What the trash entry named, kept so a restart can tell whether the restore happened.
      async prepare() {
        const entries = await trashEntries(context);
        if (!Array.isArray(entries)) return entries;
        const found = entries.find(entry => entry.entryId === args.entry && entry.path);
        return found ? { project: found.project, path: found.path, hash: found.hash } : fail('not_found', 'The trash entry does not exist or is not available to you.');
      },
      async effect() {
        const called = await context.twin('trash.restore', { params: { entry: args.entry }, body: {} });
        if (!called.ok) return called.failure;
        const restored = called.answer.body as { project: string; path: string };
        const read = await context.twin('files.read', { params: { slug: restored.project, '*': restored.path } });
        return succeed({ project: restored.project, path: restored.path, ...(read.ok ? { version: (read.answer.body as { hash: string }).hash } : {}) });
      },
      // A restore is done when the entry is gone and the file is back with the entry's version.
      async verify(note) {
        const read = await context.twin('files.read', { params: { slug: String(note.project), '*': String(note.path) } });
        if (!read.ok || (read.answer.body as { hash: string }).hash !== note.hash) return null;
        const entries = await trashEntries(context);
        if (!Array.isArray(entries) || entries.some(entry => entry.entryId === args.entry)) return null;
        return succeed({ project: note.project, path: note.path, version: note.hash });
      },
    }),
};

export const editingTools: ToolDefinition[] = [saveFile, createFile, deleteFile, restoreFile];
