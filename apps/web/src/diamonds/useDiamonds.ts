import { useCallback, useEffect, useRef, useState } from 'react';
import {
  diamondPacks,
  walletSchema,
  hintReplySchema,
  type HintRequest,
} from '@word-lagos/multiplayer';
import { jsonRequest, session } from '../multiplayer/client';
import { vatar } from '../platform/sdk';
async function post(path: string, body?: unknown) {
  const token = await session();
  return jsonRequest(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}
export function useDiamonds(enabled: boolean, demo: boolean) {
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = walletSchema.parse(await post('/api/diamonds/wallet'));
      setBalance(result.balance);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your diamonds.');
    }
  }, [enabled]);
  useEffect(() => {
    void refresh();
    const update = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener('wordpadi:purchase-update', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('wordpadi:purchase-update', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);
  async function buy(productId: string) {
    if (locked.current || !enabled) return;
    const pack = diamondPacks.find((p) => p.id === productId);
    if (!pack) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      if (demo) {
        const result = walletSchema.parse(
          await post('/api/diamonds/demo', { productId, id: crypto.randomUUID() }),
        );
        setBalance(result.balance);
      } else {
        const purchase = await (await vatar()).purchase(productId);
        await post('/api/platform/purchases/claim', { purchaseId: purchase.purchaseId });
        await refresh();
      }
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
      setError(
        code === 'cancelled'
          ? 'Purchase cancelled.'
          : code === 'not_for_sale'
            ? 'This diamond pack is awaiting approval. Please try later.'
            : 'Purchase not confirmed. Use Restore purchases before trying to buy again.',
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function hint(input: HintRequest) {
    if (locked.current) return null;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = hintReplySchema.parse(await post('/api/diamonds/hint', input));
      setBalance(result.balance);
      return result;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not confirm your automatic play. Retry without paying twice.',
      );
      return null;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function restore() {
    if (locked.current || !enabled) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      if (!demo)
        for (const p of await (await vatar()).purchases())
          await post('/api/platform/purchases/claim', { purchaseId: p.purchaseId });
      await refresh();
      window.dispatchEvent(new Event('wordpadi:purchase-update'));
    } catch {
      setError('Could not restore purchases. Your purchases are saved; please retry.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { balance, busy, error, demo, enabled, buy, hint, refresh, restore };
}
export type Diamonds = ReturnType<typeof useDiamonds>;
