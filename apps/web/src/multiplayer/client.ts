import { Client, type Room } from '@colyseus/sdk';
import { z } from 'zod';
import { runtimeSchema, codeSchema } from '@word-lagos/multiplayer';

interface VatarSDK {
  init(): Promise<{
    player: { id: string; name: string; avatar: string | null };
    session: string;
    mode: 'test' | 'live';
  }>;
  session(): Promise<{ session: string; exp: number }>;
}
declare global {
  interface Window {
    Vatar?: VatarSDK;
  }
}
let vatarReady: Promise<void> | undefined;
async function loadVatar(): Promise<void> {
  if (!vatarReady)
    vatarReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://lagoslife.app/sdk/vatar-games-v1.js';
      const timer = window.setTimeout(
        () => reject(new Error('LagosLife could not connect. Reopen the game to retry.')),
        15000,
      );
      script.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Could not load LagosLife. Check your connection.'));
      };
      document.head.append(script);
    })
      .then(async () => {
        if (!window.Vatar) throw new Error('LagosLife is unavailable.');
        await window.Vatar.init();
      })
      .catch((error) => {
        vatarReady = undefined;
        throw error;
      });
  return vatarReady;
}
export async function jsonRequest(path: string, options: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { ...options, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error('Could not reach the multiplayer server. Check your connection and retry.');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(data);
    throw new Error(
      error.success ? error.data.error : 'Multiplayer is unavailable. Please try again.',
    );
  }
  return data;
}
export async function session(): Promise<string> {
  const config = runtimeSchema.parse(await jsonRequest('/api/config'));
  if (config.authMode === 'disabled')
    throw new Error('Friend matches are coming soon. Play against Ayo while we connect LagosLife.');
  if (config.authMode === 'vatar') {
    await loadVatar();
    return (await window.Vatar!.session()).session;
  }
  // Development-only identities are issued by a loopback server. Tabs act as separate players.
  let token = sessionStorage.getItem('word-lagos:local-player');
  if (!token) {
    const player = z
      .object({ token: z.string(), name: z.string() })
      .parse(await jsonRequest('/api/local-player', { method: 'POST' }));
    token = player.token;
    sessionStorage.setItem('word-lagos:local-player', token);
  }
  return token;
}
export async function createFriendGame(): Promise<string> {
  const token = await session();
  return z.object({ code: codeSchema }).parse(
    await jsonRequest('/api/friends', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),
  ).code;
}
export async function connectFriendGame(code: string): Promise<Room> {
  const token = await session();
  await jsonRequest(`/api/friends/${code}/connect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const endpoint = import.meta.env.DEV
    ? `ws://${location.hostname}:43128`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  const client = new Client(endpoint);
  const room = await client.joinById(code, { code, session: token });
  room.reconnection.enabled = false;
  return room;
}
