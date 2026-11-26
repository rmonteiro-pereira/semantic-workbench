/**
 * Loads the validators of the Ossie 0.3.0 draft base on first need. They live in their own generated
 * module so a browser that only opens 0.2.0.dev0 files never downloads them. Validation stays
 * synchronous: callers that may meet a 0.3 file load the module first, and a check that runs before
 * that gets a blocking finding instead of a silent pass.
 */
import type { ValidateFunction } from 'ajv';
import type { Issue } from './diagnostics';

/** The Ossie development version of the draft base. */
export const OSSIE_DRAFT_VERSION = '0.3.0.dev0';

/** The validators the draft module exports. */
export type DraftValidators = {
  semanticDraft030: ValidateFunction;
  standaloneDraft030: ValidateFunction;
  embeddedDraft030: ValidateFunction;
  ontologyDraft030: ValidateFunction;
  tesseraDraft030: ValidateFunction;
  tesseraRevisionTwoDraft030: ValidateFunction;
  tesseraRevisionThreeDraft030: ValidateFunction;
  tesseraPartDraft030: ValidateFunction;
};

/** The code of the finding that says the draft checks have not been loaded yet. */
const DRAFT_CHECKS_LOADING = 'draft-checks-loading';

let loaded: DraftValidators | null = null;
let loading: Promise<DraftValidators> | null = null;
let loadCount = 0;

/** Returns the draft validators when they are loaded, or null before that. */
export function draftValidators(): DraftValidators | null {
  return loaded;
}

/** Loads the draft validators once. Later calls return the same module. */
export function loadDraftValidators(): Promise<DraftValidators> {
  if (!loading) {
    loadCount += 1;
    loading = import('../../generated/validators-0.3.js').then(module => {
      loaded = module;
      return module;
    });
  }
  return loading;
}

/** How many times the draft module was requested. Tests use it to prove a 0.2 file never asks for it. */
export function draftLoadCount(): number {
  return loadCount;
}

/**
 * Tells whether a document's text declares the draft version, without parsing it. It errs towards
 * yes: a false yes only loads the module early, while a false no would give the loading finding.
 */
function declaresDraft030(text: string): boolean {
  return text.includes(OSSIE_DRAFT_VERSION);
}

/** Loads the draft validators before a document is checked, only when its text declares the draft version. */
export async function prepareDraftChecks(text: string): Promise<void> {
  if (declaresDraft030(text)) await loadDraftValidators();
}

/** The blocking finding for a draft document checked before its validators are loaded. */
export function draftChecksLoadingIssue(): Issue {
  return {
    severity: 'error',
    code: DRAFT_CHECKS_LOADING,
    path: '/version',
    message: 'The Ossie 0.3.0 draft checks are still loading. Check the file again in a moment.',
  };
}
