import { useEffect, useRef, useState } from 'react';
import type { GroupingOptions } from './overview';
export function useGrouping(documentId?: string) {
  const [state, setState] = useState<{ id?: string; value: GroupingOptions; error: string }>({
    value: {},
    error: '',
  });
  const version = useRef(0);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    const controller = new AbortController();
    const revision = ++version.current;
    setState({ id: documentId, value: {}, error: '' });
    if (documentId)
      fetch(`/api/documents/${encodeURIComponent(documentId)}/grouping`, {
        signal: controller.signal,
      })
        .then(async r => {
          if (!r.ok) throw Error('Unable to load saved grouping.');
          return r.json();
        })
        .then(value => {
          if (version.current === revision) setState({ id: documentId, value, error: '' });
        })
        .catch(e => {
          if (e.name !== 'AbortError' && version.current === revision)
            setState({ id: documentId, value: {}, error: e.message });
        });
    return () => controller.abort();
  }, [documentId]);
  function change(value: GroupingOptions) {
    if (!documentId) return;
    const revision = ++version.current;
    setState({ id: documentId, value, error: '' });
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/grouping`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
        if (!response.ok)
          throw Error(
            'Grouping could not be saved. Your current view is retained; try the change again.',
          );
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
