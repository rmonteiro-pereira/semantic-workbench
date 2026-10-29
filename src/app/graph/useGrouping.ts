/** Remembers the selected grouping options for each open document. */
import { apiFetch } from '../projects/api';
import { useEffect, useRef, useState } from 'react';
import type { GroupingOptions } from './overview';
import { useActionRecorder } from '../workspace/ActionHistoryContext';
type GroupingState = {
  id?: string;
  value: GroupingOptions;
  /** True once the saved value came from the server or from a choice made here. */
  loaded: boolean;
  error: string;
};

/** Stores grouping preferences for the selected document. */
export function useGrouping(documentId?: string) {
  const [state, setState] = useState<GroupingState>({ value: {}, loaded: false, error: '' });
  const recorder = useActionRecorder();
  const shown = useRef<GroupingOptions>({});
  shown.current = state.id === documentId ? state.value : {};
  const version = useRef(0);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    const controller = new AbortController();
    const revision = ++version.current;
    setState({ id: documentId, value: {}, loaded: false, error: '' });
    if (documentId)
      apiFetch(`/api/documents/${encodeURIComponent(documentId)}/grouping`, {
        signal: controller.signal,
      })
        .then(async r => {
          if (!r.ok) throw Error('Unable to load saved grouping.');
          return r.json();
        })
        .then(value => {
          if (version.current === revision) setState({ id: documentId, value, loaded: true, error: '' });
        })
        .catch(e => {
          if (e.name !== 'AbortError' && version.current === revision) setState({ id: documentId, value: {}, loaded: false, error: e.message });
        });
    return () => controller.abort();
  }, [documentId]);
  // Only an explicit choice is saved. Back and Forward set the earlier or later value on screen
  // and never write to the server.
  function change(value: GroupingOptions) {
    if (!documentId) return;
    if (state.id === documentId && state.loaded) {
      const previous = shown.current;
      recorder.noteCommand('grouping', {
        undo: () => applyLocally(documentId, previous),
        redo: () => applyLocally(documentId, value),
      });
    }
    save(documentId, value);
  }
  function applyLocally(targetId: string, value: GroupingOptions) {
    version.current++;
    setState({ id: targetId, value, loaded: true, error: '' });
  }
  function save(targetId: string, value: GroupingOptions) {
    const revision = ++version.current;
    setState({ id: targetId, value, loaded: true, error: '' });
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        const response = await apiFetch(`/api/documents/${encodeURIComponent(targetId)}/grouping`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
        if (!response.ok) throw Error('Grouping could not be saved. Your current view is retained; try the change again.');
      })
      .catch(e => {
        if (version.current === revision) setState(old => ({ ...old, error: e.message }));
      });
  }
  return {
    value: state.id === documentId ? state.value : {},
    error: state.id === documentId ? state.error : '',
    change,
  };
}
