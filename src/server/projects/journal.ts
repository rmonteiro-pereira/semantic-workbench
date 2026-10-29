// Journals operations across several files as atomic, reversible renames within the data root. Only
// fully staged content is moved into place.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { atomicWriteJson, readJsonFile } from './atomic';
import type { DataLayout } from './paths';
/** A reversible rename and whether its completion has been recorded. */
export type JournalStep = { action: 'rename'; from: string; to: string; done: boolean };
/** Durable operation metadata, ordered rename steps, and cleanup paths. */
export type JournalFile = {
  formatVersion: 1;
  opId: string;
  kind: string;
  steps: JournalStep[];
  cleanup: string[];
  startedAt: string;
};
/** Reports whether an interrupted operation completed or rolled back and its affected paths. */
export type RecoveryOutcome = {
  opId: string;
  kind: string;
  outcome: 'completed' | 'rolled-back';
  paths: string[];
};
/** Simulates interruption without rollback or cleanup so startup recovery can be tested. */
export class JournalCrash extends Error {
  constructor() {
    super('Simulated crash (test hook).');
    this.name = 'JournalCrash';
  }
}
/** Allows tests to simulate a crash immediately after a chosen rename step. */
export type JournalHooks = { crashAfter?: (kind: string, step: number) => boolean };
/** Creates journaled file operations and recovery confined to the data root. */
export function createJournal(layout: DataLayout, hooks: JournalHooks = {}) {
  const abs = (path: string) => {
    const p = resolve(layout.root, path);
    if (p !== layout.root && !p.startsWith(layout.root + sep)) throw Error('Journal path escapes the data root.');
    return p;
  };
  const newId = () => `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const rel = (path: string) => relative(layout.root, path).split(sep).join('/');
  const pending = () => {
    try {
      return readdirSync(layout.journal).filter(f => f.endsWith('.json'));
    } catch {
      return [];
    }
  };
  const file = (opId: string) => join(layout.journal, opId + '.json');
  const move = (from: string, to: string) => {
    mkdirSync(dirname(abs(to)), { recursive: true });
    renameSync(abs(from), abs(to));
  };
  const save = (j: JournalFile) => atomicWriteJson(file(j.opId), j);
  const finish = (j: JournalFile) => {
    for (const path of j.cleanup) rmSync(abs(path), { recursive: true, force: true });
    rmSync(file(j.opId), { force: true });
  };
  function rollBack(j: JournalFile) {
    for (const step of [...j.steps].reverse())
      if (step.done && existsSync(abs(step.to)) && !existsSync(abs(step.from))) {
        move(step.to, step.from);
        step.done = false;
        save(j);
      }
  }
  // A rename can happen just before its `done` flag is written; detect it from the file system.
  function settle(j: JournalFile) {
    for (const step of j.steps) if (!step.done && !existsSync(abs(step.from)) && existsSync(abs(step.to))) step.done = true;
  }
  return {
    newId,
    rel,
    // Runs every step; on failure the completed steps are moved back before the error is rethrown.
    run(kind: string, steps: { from: string; to: string }[], cleanup: string[] = [], opId = newId()) {
      const j: JournalFile = {
        formatVersion: 1,
        opId,
        kind,
        steps: steps.map(s => ({
          action: 'rename',
          from: rel(abs(s.from)),
          to: rel(abs(s.to)),
          done: false,
        })),
        cleanup: cleanup.map(c => rel(abs(c))),
        startedAt: new Date().toISOString(),
      };
      save(j);
      try {
        for (const [i, step] of j.steps.entries()) {
          if (existsSync(abs(step.to))) throw Error(`Destination already exists: ${step.to}`);
          move(step.from, step.to);
          step.done = true;
          save(j);
          if (hooks.crashAfter?.(kind, i)) throw new JournalCrash();
        }
      } catch (e) {
        if (e instanceof JournalCrash) throw e;
        rollBack(j);
        finish(j);
        throw e;
      }
      finish(j);
      return j;
    },
    pending,
    // Start-up recovery: roll an unfinished operation forward when every remaining source exists
    // and every destination is free; otherwise roll the completed steps back.
    recover(): RecoveryOutcome[] {
      return pending().map(name => {
        const j = readJsonFile<JournalFile>(join(layout.journal, name))!;
        settle(j);
        const remaining = j.steps.filter(s => !s.done);
        // Check the remaining steps in order against the file system as earlier steps would leave
        // it.
        const moved = new Map<string, boolean>();
        const exists = (p: string) => moved.get(p) ?? existsSync(abs(p));
        const forward = remaining.every(s => {
          const ok = exists(s.from) && !exists(s.to);
          moved.set(s.from, false);
          moved.set(s.to, true);
          return ok;
        });
        let outcome: RecoveryOutcome['outcome'] = 'rolled-back';
        if (forward) {
          try {
            for (const step of remaining) {
              move(step.from, step.to);
              step.done = true;
              save(j);
            }
            outcome = 'completed';
          } catch {
            rollBack(j);
          }
        } else rollBack(j);
        finish(j);
        return { opId: j.opId, kind: j.kind, outcome, paths: j.steps.map(s => s.to) };
      });
    },
  };
}
/** Runs and recovers durable operations composed of reversible file renames. */
export type Journal = ReturnType<typeof createJournal>;
