import type { TrashEntry } from '../projects/trash';

/** Internal proof that a completed receipt needs authorization without repeating its effect. */
export const receiptReplay = Symbol('receiptReplay');

/** Original authorization fields for a file restored from the trash. */
export type ReceiptTrashTarget = Pick<TrashEntry, 'kind' | 'project' | 'path' | 'deletedBy' | 'copy'>;

/** A replay may need the original trash target after restoration consumed the entry. */
export type ReceiptReplay = { trash?: ReceiptTrashTarget };

/** Request metadata is set only by the operation twin adapter. */
export type ReceiptReplayRequest = Request & { [receiptReplay]?: ReceiptReplay };
