import { Client, type Room } from '@colyseus/sdk';
import { z } from 'zod';
import {
  statsSchema,
  runtimeSchema,
  codeSchema,
  gameListSchema,
  recordSchema,
} from '@word-lagos/multiplayer';

import { vatar, platformMatchSchema } from '../platform/sdk';

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
let localSessionRequest: Promise<string> | undefined;
let platformSession: { session: string; exp: number } | undefined;
let renewingSession: Promise<{ session: string; exp: number }> | undefined;
export async function session(): Promise<string> {
  const config = runtimeSchema.parse(await jsonRequest('/api/config'));
  if (config.authMode === 'disabled')
    throw new Error('Friend matches are coming soon. Play against Ayo while we connect LagosLife.');
  if (config.authMode === 'vatar') {
    if (platformSession && platformSession.exp > Date.now() + 60000) return platformSession.session;
    if (!renewingSession)
      renewingSession = vatar()
        .then((sdk) => sdk.session())
        .then((value) => {
          platformSession = z.object({ session: z.string().min(10), exp: z.number() }).parse(value);
          return platformSession;
        })
        .finally(() => {
          renewingSession = undefined;
        });
    return (await renewingSession).session;
  }
  // Development-only identities are issued by a loopback server. Tabs act as separate players.
  const token = sessionStorage.getItem('word-lagos:local-player');
  if (token) return token;
  if (!localSessionRequest)
    localSessionRequest = jsonRequest('/api/local-player', { method: 'POST' })
      .then((value) => {
        const player = z.object({ token: z.string(), name: z.string() }).parse(value);
        sessionStorage.setItem('word-lagos:local-player', player.token);
        return player.token;
      })
      .finally(() => {
        localSessionRequest = undefined;
      });
  return localSessionRequest;
}
export async function createFriendGame(rematchOf?: string): Promise<string> {
  const config = runtimeSchema.parse(await jsonRequest('/api/config'));
  if (rematchOf) {
    const token = await session();
    const info = z
      .object({ existingCode: codeSchema.nullable(), mustJoinPlatform: z.boolean() })
      .parse(
        await jsonRequest(`/api/friends/${rematchOf}/rematch`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
    if (info.existingCode)
      return info.mustJoinPlatform ? joinFriendCode(info.existingCode) : info.existingCode;
  }
  if (config.authMode === 'vatar' && config.platformMatches) {
    const match = platformMatchSchema.parse(
      await (await vatar()).match.create({ stake: 0, seats: 2 }),
    );
    return importPlatformMatch(match, rematchOf);
  }
  const token = await session();
  return z.object({ code: codeSchema }).parse(
    await jsonRequest(rematchOf ? `/api/friends/${rematchOf}/rematch` : '/api/friends', {
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

export async function listFriendGames(completed = false, offset = 0) {
  const token = await session();
  return gameListSchema.parse(
    await jsonRequest(`/api/friends?completed=${completed}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}
export async function playerRecord(code: string) {
  const token = await session();
  return recordSchema.parse(
    await jsonRequest(`/api/friends/${codeSchema.parse(code)}/record`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}

export async function importPlatformMatch(
  match: { id: string; code: string },
  rematchOf?: string,
): Promise<string> {
  const token = await session();
  return z.object({ code: codeSchema }).parse(
    await jsonRequest('/api/platform/matches', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: match.id, code: match.code, rematchOf }),
    }),
  ).code;
}
export async function joinFriendCode(code: string): Promise<string> {
  const config = runtimeSchema.parse(await jsonRequest('/api/config'));
  if (config.authMode !== 'vatar' || !config.platformMatches) return code;
  const match = platformMatchSchema.parse(await (await vatar()).match.join(code));
  return importPlatformMatch(match);
}

export async function playerStats() {
  const token = await session();
  return statsSchema.parse(
    await jsonRequest('/api/me/stats', { headers: { Authorization: `Bearer ${token}` } }),
  );
}
