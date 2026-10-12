import { useEffect, useState } from 'react';
import { runtimeSchema, type PlayerStats } from '@word-lagos/multiplayer';
import { jsonRequest, playerStats } from './client';
export function usePlayerStats(revision?: number) {
  const [stats, setStats] = useState<PlayerStats | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true,
      fetching = false;
    async function refresh() {
      if (fetching || document.hidden) return;
      fetching = true;
      try {
        const config = runtimeSchema.parse(await jsonRequest('/api/config'));
        if (
          config.authMode === 'disabled' ||
          (config.authMode === 'vatar' && window.parent === window)
        ) {
          if (active) setError('Open WordPadi in LagosLife to see your friend-game stats.');
          return;
        }
        const result = await playerStats();
        if (active) {
          setStats(result);
          setError('');
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your stats.');
      } finally {
        fetching = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [revision, attempt]);
  return { stats, error, retry: () => setAttempt((n) => n + 1) };
}
