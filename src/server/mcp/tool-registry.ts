// The tools of the first release, sorted by name so every listing is byte for byte the same. A test compares this list with the tool contract, the route inventory and the documentation.
import type { ToolDefinition } from './tool-definition';

/** Every tool, sorted by name. */
export const TOOLS: ToolDefinition[] = [].sort((left: ToolDefinition, right: ToolDefinition) => (left.name < right.name ? -1 : 1));
