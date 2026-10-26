import { problemText } from './api';
import { useEffect, useState } from 'react';

/** Loads an area again after successful changes and ignores responses after it closes. */
export function useAdminData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    setData(null);
    void load().then(
      value => {
        if (active) setData(value);
      },
      problem => {
        if (active) setError(problemText(problem));
      },
    );
    return () => {
      active = false;
    };
  }, [load, revision]);
  return { data, error, reload: () => setRevision(value => value + 1) };
}
