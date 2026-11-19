import { useEffect, useState } from 'react';
import { endpoint } from './endpoint';
import type { UltraSnapshot } from './types';

function isUltraSnapshot(value: unknown): value is UltraSnapshot {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as UltraSnapshot).schema === 'pinwhy.ultra.v1',
  );
}

/**
 * Subscribe to the read-only Ultra coverage projection (`/api/ultra` + `/ultra-events`).
 * Re-fetches `/api/ultra` whenever `revision` advances (e.g. a human write on the board).
 * In static HTML exports, reads the embedded snapshot without issuing network requests.
 */
export function useUltraStream(enabled: boolean, asOf: string | null, isStatic: boolean, revision?: unknown): UltraSnapshot | null {
  const [ultra, setUltra] = useState<UltraSnapshot | null>(() => {
    const embedded = typeof window !== 'undefined' ? window.__PINWHY_ULTRA__ : undefined;
    return isUltraSnapshot(embedded) ? embedded : null;
  });

  useEffect(() => {
    if (isStatic) {
      const embedded = window.__PINWHY_ULTRA__;
      setUltra(isUltraSnapshot(embedded) ? embedded : null);
      return;
    }
    if (!enabled) return;

    let disposed = false;
    const load = async () => {
      try {
        const suffix = asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
        const response = await fetch(endpoint(`/api/ultra${suffix}`), { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!disposed && isUltraSnapshot(data)) setUltra(data);
      } catch { /* Keep the last usable snapshot until the stream reconnects. */ }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [enabled, asOf, isStatic, revision]);

  useEffect(() => {
    if (isStatic || !enabled || asOf || typeof EventSource === 'undefined') return;
    let disposed = false;
    const source = new EventSource(endpoint('/ultra-events'));
    source.addEventListener('ultra', (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data);
        if (!disposed && isUltraSnapshot(parsed)) setUltra(parsed);
      } catch { /* Ignore malformed SSE payload. */ }
    });
    return () => {
      disposed = true;
      source.close();
    };
  }, [enabled, asOf, isStatic]);

  return ultra;
}
