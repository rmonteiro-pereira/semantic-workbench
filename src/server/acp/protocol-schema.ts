// The pinned Agent Client Protocol schema and one validator for every frame body the workbench sends or accepts.
import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv/dist/2020';
import schema from '../../../schemas/acp-1.32.0.json';

/** Protocol version number sent in the initialize request. The file name carries the schema release. */
export const ACP_PROTOCOL_VERSION = 1;

/** The definitions of the pinned schema that the workbench uses, by the name the schema gives them. */
export const FRAME_DEFINITIONS = [
  'InitializeRequest',
  'InitializeResponse',
  'NewSessionRequest',
  'NewSessionResponse',
  'PromptRequest',
  'PromptResponse',
  'CancelNotification',
  'SessionNotification',
  'ReadTextFileRequest',
  'ReadTextFileResponse',
  'WriteTextFileRequest',
  'WriteTextFileResponse',
  'RequestPermissionRequest',
  'RequestPermissionResponse',
] as const;
/** Name of one frame body definition. */
export type FrameDefinition = (typeof FRAME_DEFINITIONS)[number];

const SCHEMA_ID = 'urn:semantic-workbench:acp-schema';

// The schema uses vendor keywords and numeric formats that Ajv does not know, so strictness and format checks are off, as for the other pinned standards.
const ajv = new Ajv2020({ strict: false, allErrors: false, validateFormats: false });
ajv.addSchema(schema, SCHEMA_ID);

const validators = new Map<FrameDefinition, ValidateFunction>();

/** The compiled validator for one frame body definition. */
export function validatorFor(definition: FrameDefinition): ValidateFunction {
  const existing = validators.get(definition);
  if (existing) return existing;
  const compiled = ajv.compile({ $ref: `${SCHEMA_ID}#/$defs/${definition}` });
  validators.set(definition, compiled);
  return compiled;
}

/** Whether a value is a valid body of the named definition. */
export function matchesDefinition(definition: FrameDefinition, value: unknown): boolean {
  return validatorFor(definition)(value) === true;
}
