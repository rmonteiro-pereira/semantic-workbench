// Classification levels shared by the access policies on the server and the browser's controls.

/** Classification levels from least to most sensitive; their index is the level number. */
export const LEVELS = ['public', 'internal', 'confidential', 'restricted'] as const;

/** One classification level. */
export type Level = (typeof LEVELS)[number];

/** Numeric value of a level for comparisons in policies. */
export const levelNumber = (level: Level) => LEVELS.indexOf(level);
