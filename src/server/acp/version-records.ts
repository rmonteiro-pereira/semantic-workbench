// What the agent last read or wrote, per file, so a later write can be checked against the version it started from.

/** Most files remembered per session. The least recently used is forgotten first, which only costs the agent a read. */
export const MAXIMUM_VERSION_RECORDS = 2000;

/** Remembers one version per project file, bounded, least recently used out first. */
export function createVersionRecords(limit: number = MAXIMUM_VERSION_RECORDS) {
  const records = new Map<string, string>();
  const key = (project: string, path: string) => `${project}\u0000${path}`;
  return {
    /** The version recorded for a file, which also counts as a use. */
    get(project: string, path: string): string | undefined {
      const name = key(project, path);
      const version = records.get(name);
      if (version === undefined) return undefined;
      records.delete(name);
      records.set(name, version);
      return version;
    },
    set(project: string, path: string, version: string): void {
      const name = key(project, path);
      records.delete(name);
      records.set(name, version);
      if (records.size > limit) records.delete(records.keys().next().value as string);
    },
    forget(project: string, path: string): void {
      records.delete(key(project, path));
    },
    get size(): number {
      return records.size;
    },
  };
}

export type VersionRecords = ReturnType<typeof createVersionRecords>;
