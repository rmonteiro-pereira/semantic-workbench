// What each agent-connection scope allows, in plain words. The consent page and the Admin's agent
// programs both show it, so it lives where the browser app and the server can read it.

/** The label and the one-sentence meaning of each scope a person may choose. */
export const SCOPE_WORDING = {
  read: { label: 'Read', allows: 'Read definitions, findings, history and published context you may read.' },
  validate: { label: 'Validate', allows: 'Check proposed text without saving it.' },
  edit: { label: 'Edit', allows: 'Create, change and delete files in your own working copy, as you. Nothing is published.' },
  commit: { label: 'Commit', allows: 'Commit the files it names to your working branch, with your name as author.' },
  remote: { label: 'Remote', allows: 'Use your Git credential held by this server to fetch, pull and push.' },
  publish: { label: 'Publish', allows: 'Move the published branch that every consumer reads.' },
} as const satisfies Record<string, { label: string; allows: string }>;

/** A scope that has wording, which is every scope a person may choose. */
export type WordedScope = keyof typeof SCOPE_WORDING;
