/** Targets shared by item dialogs and inspectors. */
import type { ItemKind, Path } from '../edit/item-model';
/** Identifies an editable structured item. */
export type ItemTarget = { docId: string; path: Path; kind: ItemKind };
/** Identifies an editable RDF resource. */
export type RdfTarget = { docId: string; subject: string; label: string; kind: string };

/** Parsed model accepted by the workspace validation pipeline. */
export type ValidatedModel = ReturnType<typeof import('../input').validateInput>['model'];
