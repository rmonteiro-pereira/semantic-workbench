// Moves a project's usage counts into its trash entry and back, so deleting a project to the trash and
// restoring it keeps its counts, and purging the entry removes them with the rest of the entry.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { UsageRecorder } from './usage-recorder';
import { OccupiedError } from '../projects/errors';
import { assertSlug, type DataLayout } from '../projects/paths';

type Step = { from: string; to: string };
const active = new WeakMap<DataLayout, Set<UsageRecorder>>();

/** Connects the recorder's lifetime to the layout whose trash operation moves its day files. */
export function trackUsageRecorder(layout: DataLayout, recorder: UsageRecorder): UsageRecorder {
  if (!recorder.enabled) return recorder;
  const recorders = active.get(layout) ?? new Set();
  active.set(layout, recorders);
  recorders.add(recorder);
  return {
    ...recorder,
    close: () => recorder.close().finally(() => recorders.delete(recorder)),
  };
}

/** The renames that put a project's day files into the trash entry's folder. */
export function archiveUsage(layout: DataLayout, project: string, archive: string): Step[] {
  for (const recorder of active.get(layout) ?? []) recorder.archive(project);
  const from = join(layout.usage, assertSlug(project));
  return existsSync(from) ? [{ from, to: join(archive, 'usage', assertSlug(project)) }] : [];
}

/**
 * The renames that bring archived counts back. Counts are restored only to the project's own name,
 * because their addresses name that project, and never over counts a project of that name holds now.
 */
export function restoreUsage(layout: DataLayout, originalProject: string, targetProject: string, archive: string): Step[] {
  if (originalProject !== targetProject) return [];
  const from = join(archive, 'usage', assertSlug(originalProject));
  const to = join(layout.usage, assertSlug(targetProject));
  if (!existsSync(from)) return [];
  if (existsSync(to)) throw new OccupiedError('Usage state already exists for the restored project.', {});
  return [{ from, to }];
}
