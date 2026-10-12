import { useEffect, useState } from 'react';
import {
  runtimeSchema,
  themeOwnershipSchema,
  themeIdSchema,
  themeCatalog,
  type ThemeId,
} from '@word-lagos/multiplayer';
import { importPlatformMatch, jsonRequest, session } from '../multiplayer/client';
import { initializeVatar, platformMatchSchema, vatar, type PlatformIdentity } from './sdk';

const ownershipSchema = themeOwnershipSchema;
export function usePlatform() {
  const [identity, setIdentity] = useState<PlatformIdentity | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string; price: number }[]>([]);
  const [ownedThemes, setOwnedThemes] = useState<ThemeId[]>([]);
  const [theme, setTheme] = useState<ThemeId>('classic');
  const [previewTheme, setPreviewTheme] = useState<ThemeId | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hostPaused, setHostPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const change = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useEffect(() => {
    let active = true;
    const unsubscribe: (() => void)[] = [];
    async function claim(purchaseId: string) {
      const token = await session();
      const result = ownershipSchema.parse(
        await jsonRequest('/api/platform/purchases/claim', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseId }),
        }),
      );
      if (active) setOwnedThemes(result.themes);
      window.dispatchEvent(new Event('wordpadi:purchase-update'));
    }
    void (async () => {
      const config = runtimeSchema.parse(await jsonRequest('/api/config'));
      if (!active) return;
      if (config.authMode === 'local') {
        setDemo(true);
        return;
      }
      if (config.authMode !== 'vatar' || window.parent === window) return;
      setProducts(config.themeProducts);
      const player = await initializeVatar();
      if (!active) return;
      setIdentity(player);
      const sdk = await vatar();
      if (!active) return;
      setError('');
      unsubscribe.push(
        sdk.onPause(() => setHostPaused(true)),
        sdk.onResume(() => setHostPaused(false)),
      );
      unsubscribe.push(
        sdk.onPurchase((purchase) => {
          void claim(purchase.purchaseId).catch(() => {
            if (active)
              setError('Your purchase is saved. Tap Restore purchases to finish delivery.');
          });
        }),
      );
      if (config.platformMatches) {
        const sync = async (input: unknown) => {
          const match = platformMatchSchema.parse(input);
          if (!['open', 'playing'].includes(match.status)) return;
          const code = await importPlatformMatch(match);
          if (active)
            window.dispatchEvent(new CustomEvent('wordpadi:platform-update', { detail: code }));
        };
        unsubscribe.push(
          sdk.match.onUpdate((match) => {
            void sync(match).catch(() => {
              if (active)
                setError('Could not sync your LagosLife match. Reopen My games to reconnect.');
            });
          }),
        );
        try {
          const current = await sdk.match.current();
          if (current) await sync(current);
        } catch {
          if (active) setError('Could not restore your platform match. Try My games to reconnect.');
        }
      }
      if (config.themeProducts.length) {
        const pending = await sdk.purchases();
        for (const purchase of pending) await claim(purchase.purchaseId);
        const token = await session();
        const result = ownershipSchema.parse(
          await jsonRequest('/api/platform/theme', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        if (active) {
          setOwnedThemes(result.themes);
          try {
            const stored = themeIdSchema.safeParse(
              localStorage.getItem(`wordpadi:theme:${player.mode}:${player.player.id}`),
            );
            setTheme(
              stored.success && (stored.data === 'classic' || result.themes.includes(stored.data))
                ? stored.data
                : 'classic',
            );
          } catch {
            /* Theme choice remains available in memory. */
          }
        }
      }
    })().catch((cause) => {
      if (active)
        setError(cause instanceof Error ? cause.message : 'Could not connect to LagosLife.');
    });
    return () => {
      active = false;
      unsubscribe.forEach((fn) => fn());
    };
  }, [attempt]);
  async function buy(themeId: ThemeId) {
    if (busy) return;
    if (demo) {
      setOwnedThemes((current) => [...new Set([...current, themeId])]);
      setTheme(themeId);
      setPreviewTheme(null);
      return;
    }
    const catalog = themeCatalog.find((t) => t.id === themeId);
    const product = products.find((p) => p.id === catalog?.productId);
    if (!product) {
      setError('This theme is not available for purchase yet.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const purchase = await (await vatar()).purchase(product.id);
      const token = await session();
      const result = ownershipSchema.parse(
        await jsonRequest('/api/platform/purchases/claim', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseId: purchase.purchaseId }),
        }),
      );
      setOwnedThemes(result.themes);
      if (result.themes.includes(themeId)) chooseTheme(themeId, true);
    } catch (cause) {
      const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
      setError(
        code === 'cancelled'
          ? 'Purchase cancelled. Nothing was unlocked.'
          : code === 'payment_failed'
            ? 'The payment did not complete. You can try again.'
            : 'Your purchase could not be confirmed. Try Restore purchases before buying again.',
      );
    } finally {
      setBusy(false);
    }
  }
  function chooseTheme(next: ThemeId, justPurchased = false) {
    if (next !== 'classic' && !ownedThemes.includes(next) && !justPurchased) return;
    setPreviewTheme(null);
    setTheme(next);
    if (identity)
      try {
        localStorage.setItem(`wordpadi:theme:${identity.mode}:${identity.player.id}`, next);
      } catch {
        /* The selection still works for this visit. */
      }
  }
  return {
    identity,
    products,
    ownedThemes,
    demo,
    previewTheme,
    preview: setPreviewTheme,
    theme,
    error,
    busy,
    paused: hostPaused || hidden,
    buy,
    chooseTheme,
    restore: () => {
      setError('');
      setAttempt((n) => n + 1);
    },
  };
}
