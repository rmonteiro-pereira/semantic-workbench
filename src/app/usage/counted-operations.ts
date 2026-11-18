/** The operations whose requests Traffic counts, as the server's table lists them. */
import { countedOperations } from '../../shared/usage/usage-counted-operations';

/** Ids of the counted operations. */
export const COUNTED_OPERATIONS: readonly string[] = countedOperations.map(entry => entry.operation);
