// Watches each repository folder once and debounces change notifications per project. A
// repository can hold several projects in subfolders; a change inside one folder notifies that
// project, and a Git change (branch, index, refs) notifies every project of the repository.
// Periodic rescans cover missed filesystem events.
import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { DataLayout, ProjectLocation } from './paths';
import { log } from '../observability/log';
/** Delay used to combine bursts of filesystem changes per project. */
export const DEBOUNCE_MS = 150;
/** Interval for rescans that catch missed filesystem events. */
export const RESCAN_MS = 60_000;
/** Watches project folders, flags Git metadata changes, and schedules periodic rescans. */
export function createWatcher(
  layout: DataLayout,
  options: {
    onChange: (slug: string, gitChanged: boolean) => Promise<void>;
    all: () => string[];
    /** Where a registered project lives: its folder and repository under data/projects/. */
    locate: (slug: string) => ProjectLocation;
    debounceMs?: number;
    rescanMs?: number;
  },
) {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const rescanMs = options.rescanMs ?? RESCAN_MS;
  const watchers = new Map<string, FSWatcher>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const gitFlags = new Map<string, boolean>();
  const running = new Map<string, Promise<void>>();
  function schedule(slug: string, gitChanged: boolean) {
    if (gitChanged) gitFlags.set(slug, true);
    clearTimeout(timers.get(slug));
    timers.set(
      slug,
      setTimeout(() => {
        timers.delete(slug);
        const g = gitFlags.get(slug) ?? false;
        gitFlags.delete(slug);
        const next = (running.get(slug) ?? Promise.resolve()).then(() => options.onChange(slug, g)).catch(e => log.failure('watcher.change-failed', e, { project: slug }));
        running.set(slug, next);
      }, debounceMs),
    );
  }
  const interval = setInterval(() => {
    for (const slug of options.all()) schedule(slug, true);
  }, rescanMs);
  return {
    add(slug: string) {
      const { repo } = options.locate(slug);
      if (watchers.has(repo)) return;
      try {
        const w = watch(join(layout.projects, repo), { recursive: true }, (_event, name) => {
          const file = String(name ?? '')
            .split('\\')
            .join('/');
          const inRepo = options.all().filter(project => options.locate(project).repo === repo);
          if (file === '.git' || file.startsWith('.git/')) {
            if (/^\.git\/(HEAD|index|refs\/)/.test(file)) for (const project of inRepo) schedule(project, true);
            return;
          }
          for (const project of inRepo) {
            const { folder } = options.locate(project);
            const inside = folder === repo ? '' : folder.slice(repo.length + 1) + '/';
            if (!inside || file.startsWith(inside)) schedule(project, false);
          }
        });
        w.on('error', () => {
          w.close();
          watchers.delete(repo);
        });
        watchers.set(repo, w);
      } catch (e) {
        log.failure('watcher.cannot-watch', e, { repo });
      }
    },
    // Stops the repository's watcher once no other registered project uses it.
    remove(slug: string) {
      clearTimeout(timers.get(slug));
      timers.delete(slug);
      let repo: string;
      try {
        repo = options.locate(slug).repo;
      } catch {
        return;
      }
      const others = options.all().filter(project => project !== slug && options.locate(project).repo === repo);
      if (others.length) return;
      watchers.get(repo)?.close();
      watchers.delete(repo);
    },
    /** The repository folders watched now. */
    watching: () => [...watchers.keys()],
    close() {
      clearInterval(interval);
      for (const w of watchers.values()) w.close();
      watchers.clear();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
