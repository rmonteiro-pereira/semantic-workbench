/** Loads cancellable mesh reads for the importing file. */
import type { ReaderValidation } from '../../shared/tessera/set-validation';
import { api, type Doc } from '../projects/api';
import { useEffect, useState } from 'react';
import { readDependencyState, readProviders, readPublishedInterfaces, type DependencyState, type ProviderChoice } from './api';

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

/** Loads authorized set findings for the visible saved revision of one document. */
export function useUnitSet(doc: Doc | undefined, enabled: boolean): ReaderValidation | undefined {
  const [stored, setStored] = useState<{ key: string; value?: ReaderValidation }>();
  const key = enabled && doc ? JSON.stringify([doc.project, doc.path, doc.hash]) : '';
  useEffect(() => {
    if (!key || !doc) return;
    let current = true;
    void api
      .file(doc.project, doc.path)
      .then(response => {
        if (current && response.hash === doc.hash) setStored({ key, value: response.unitValidation });
      })
      .catch(() => {
        if (current) setStored({ key, value: { singleFile: {}, set: [], setNotChecked: true } });
      });
    return () => {
      current = false;
    };
  }, [key]);
  return stored?.key === key ? stored.value : undefined;
}

/** Reads frozen public imports for the active project only while viewing a revision-three unit. */
export function usePublishedInterfaces(project: string | undefined, activeHash: string, lockHash: string) {
  return useRead(project ? JSON.stringify([project, activeHash, lockHash]) : '', signal => readPublishedInterfaces(project!, signal));
}
