/** Loads cancellable mesh reads for the importing file. */
import { useEffect, useState } from 'react';
import { readDependencyState, readProviders, type DependencyState, type ProviderChoice } from './api';

/** Distinguishes loading, failure and completed mesh reads. */
export type MeshRead<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: T };

function useRead<T>(key: string, load: (signal: AbortSignal) => Promise<T>): MeshRead<T> {
  const [stored, setStored] = useState<{ key: string; data: MeshRead<T> }>({ key, data: { status: 'loading' } });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    load(controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setStored({ key, data: { status: 'ready', value } });
      })
      .catch(error => {
        if (!controller.signal.aborted) setStored({ key, data: { status: 'error', message: (error as Error).message } });
      });
    return () => controller.abort();
  }, [key]);
  return stored.key === key ? stored.data : { status: 'loading' };
}

/** Loads published provider choices only while the import editor is open. */
export function useProviderChoices(open: boolean): MeshRead<ProviderChoice[]> {
  return useRead(open ? 'providers' : '', signal => readProviders(signal));
}

/** Loads the editing status of the active root. */
export function useDependencyState(project: string, path: string | undefined, hash: string, refresh = 0): MeshRead<DependencyState | undefined> {
  return useRead(JSON.stringify([project, path, hash, refresh]), signal => readDependencyState(project, path, signal));
}
