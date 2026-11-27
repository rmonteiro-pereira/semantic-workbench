/** The Ossie draft version the workbench knows, and how a document's declared version is read. */
import { itemValue } from '../edit/yaml-patch';

/** The Ossie development version of the draft base. */
export const OSSIE_DRAFT_VERSION = '0.3.0.dev0';

/**
 * The Ossie version a document declares in its top-level `version` key, read through the YAML and JSON parser.
 * Text that does not parse (Turtle, or a file mid-edit) declares none, because screens call this on every render.
 */
export function declaredVersion(source: string): unknown {
  try {
    return itemValue(source, ['version']);
  } catch {
    return undefined;
  }
}
