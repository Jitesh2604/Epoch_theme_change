import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiError } from '../lib/api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> & { refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards against out-of-order responses. Every consumer of this hook
  // (e.g. the Leaderboard page's Global/State/School switcher) re-fires
  // `run` whenever `deps` changes, but nothing previously stopped an OLDER,
  // slower request from resolving after a NEWER one and silently
  // overwriting its result — a user switching scopes while an earlier
  // fetch is still in flight would see the earlier scope's data reappear
  // with no visual sign anything was wrong, "fixed" only by a full reload
  // (which starts a single clean request with nothing left to race
  // against). Each invocation of `run` stamps a unique id; a response only
  // commits state if it's still the most recent invocation when it lands.
  const requestIdRef = useRef(0);

  const run = useCallback(async () => {
    const myRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (myRequestId !== requestIdRef.current) return; // superseded by a newer request
      setData(result);
    } catch (e) {
      if (myRequestId !== requestIdRef.current) return;
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      if (myRequestId === requestIdRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refetch: run };
}
