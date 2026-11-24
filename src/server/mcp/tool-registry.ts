// The tools of the first release, sorted by name so every listing is byte for byte the same. A test compares this list with the tool contract, the route inventory and the documentation.
import type { ToolDefinition } from './tool-definition';
import { editingTools } from './tools/editing';
import { projectAndFileTools } from './tools/projects-and-files';
import { publishedContextTools } from './tools/published-context';
import { sourceControlTools } from './tools/source-control';
import { standardOutputTools } from './tools/standard-output';
import { validationTools } from './tools/validation';

/** Every tool, sorted by name. */
export const TOOLS: ToolDefinition[] = [...projectAndFileTools, ...sourceControlTools, ...publishedContextTools, ...validationTools, ...editingTools, ...standardOutputTools].sort((left, right) =>
  left.name < right.name ? -1 : 1,
);
