import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client, type Room } from '@colyseus/sdk';
import { makeLexicon, type Placement } from '@word-lagos/game-core';
import { replySchema, snapshotSchema, type Snapshot, type Command } from '@word-lagos/multiplayer';
import { openStore, type Store } from './store';
import { Auth } from './auth';
import { Matches, snapshot } from './matches';
import { startServer } from './server';

let store: Store;
let matches: Matches;
let auth: Auth;
let server: Awaited<ReturnType<typeof startServer>>;
const dictionary = makeLexicon('AT\nCAT\nDOG\nIT\nTO\nIN\nON\nAN');
const playerA = { id: 'a', name: 'Ada' },
  playerB = { id: 'b', name: 'Bayo' },
  playerC = { id: 'c', name: 'Chidi' };
beforeAll(async () => {
  store = await openStore();
  matches = new Matches(store, dictionary);
  auth = new Auth('local', store);
  server = await startServer({ store, auth, matches });
}, 30000);
afterAll(async () => {
  await server?.close();
  await store?.close();
}, 30000);
const command = (revision: number, action: Command['action'] = { kind: 'pass' }): Command => ({
  id: randomUUID(),
  revision,
  action,
});

describe('durable multiplayer rules', () => {
  it('reserves exactly two seats even when two friends join concurrently', async () => {
    const created = await matches.create(playerA);
    const results = await Promise.allSettled([
      matches.join(created.code, playerB),
      matches.join(created.code, playerC),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await matches.get(created.code)).players).toHaveLength(2);
  });
  it('rejects outsiders, out-of-turn actions and forged tiles', async () => {
    const game = await matches.join((await matches.create(playerA)).code, playerB);
    await expect(matches.act(game.code, playerC.id, command(game.revision))).rejects.toThrow(
      'not a player',
    );
    await expect(matches.act(game.code, playerB.id, command(game.revision))).rejects.toThrow(
      'friend’s turn',
    );
    const placements: Placement[] = [
      { tileId: 'fake', row: 7, col: 7, letter: 'A' },
      { tileId: 'fake2', row: 7, col: 8, letter: 'T' },
    ];
    await expect(
      matches.act(game.code, playerA.id, command(game.revision, { kind: 'play', placements })),
    ).rejects.toThrow();
    expect((await matches.get(game.code)).revision).toBe(game.revision);
  });
  it('commits a retried action once, and rejects stale concurrent moves', async () => {
    const game = await matches.join((await matches.create(playerA)).code, playerB);
    const move = command(game.revision);
    await matches.act(game.code, playerA.id, move);
    await matches.act(game.code, playerA.id, move);
    expect((await matches.get(game.code)).game.history).toHaveLength(1);
    await expect(
      matches.act(game.code, playerA.id, { ...move, action: { kind: 'exchange', ids: ['A0'] } }),
    ).rejects.toThrow('already used');
    await expect(matches.act(game.code, playerB.id, command(game.revision))).rejects.toThrow(
      'board changed',
    );
    const next = await matches.get(game.code);
    const results = await Promise.allSettled([
      matches.act(game.code, playerB.id, command(next.revision)),
      matches.act(game.code, playerB.id, command(next.revision)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await matches.get(game.code)).game.history).toHaveLength(2);
  });
  it('restores accepted moves from storage and keeps hidden tiles private', async () => {
    const game = await matches.join((await matches.create(playerA)).code, playerB);
    const next = await matches.act(game.code, playerA.id, command(game.revision));
    const restored = await new Matches(store, dictionary).get(game.code);
    expect(restored).toEqual(next);
    const view = snapshot(restored, playerB.id, new Set([playerB.id]));
    expect(view.turn).toBe(0);
    expect(view.rack).toEqual(next.game.racks[1]);
    expect(view).not.toHaveProperty('rng');
    expect(view).not.toHaveProperty('bag');
    expect(view).not.toHaveProperty('racks');
    const hiddenIds = next.game.racks[0].map((t) => t.id);
    expect(view.rack.some((t) => hiddenIds.includes(t.id))).toBe(false);
    expect(view.players).toEqual([
      { name: 'Bayo', online: true },
      { name: 'Ada', online: false },
    ]);
  });
  it('keeps local, sandbox and live matches separate', async () => {
    const local = await matches.create(playerA);
    await expect(new Matches(store, dictionary, 'test').get(local.code)).rejects.toThrow(
      'does not exist',
    );
    await expect(new Matches(store, dictionary, 'live').get(local.code)).rejects.toThrow(
      'does not exist',
    );
  });
  it('finishes after six scoreless turns and rejects later actions', async () => {
    let game = await matches.join((await matches.create(playerA)).code, playerB);
    for (let i = 0; i < 6; i++)
      game = await matches.act(game.code, game.players[game.game.turn].id, command(game.revision));
    expect(game.game.status).toBe('finished');
    await expect(matches.act(game.code, playerA.id, command(game.revision))).rejects.toThrow(
      'finished',
    );
  });
});

describe('identity boundary', () => {
  it('never trusts a made-up local player id', async () => {
    await expect(auth.verify('local.made-up-player')).rejects.toThrow('expired');
    const issued = await auth.issueLocal();
    expect((await auth.verify(issued.token)).name).toBe(issued.name);
  });
  it('verifies with the game-scoped secret without a configured game ID', async () => {
    const valid = {
      playerId: 't_abc',
      name: 'Ada',
      gameId: 'provider-game-id',
      mode: 'test',
      exp: Date.now() + 60000,
    };
    let response: unknown = valid;
    let status = 200;
    const request: typeof fetch = async (url, options) => {
      expect(url).toBe('https://lagoslife.app/api/games/v1/session/verify');
      expect(options?.method).toBe('POST');
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer vtr_test_example');
      expect(JSON.parse(String(options?.body))).toEqual({ session: 'signed-token-example' });
      return new Response(JSON.stringify(response), { status });
    };
    const vatar = new Auth('vatar', store, 'vtr_test_example', undefined, request);
    expect((await vatar.verify('signed-token-example')).id).toBe('t_abc');
    for (const invalid of [{ ...valid, mode: 'live' }, { ...valid, exp: 0 }, {}]) {
      response = invalid;
      await expect(vatar.verify('signed-token-example')).rejects.toThrow('invalid');
    }
    response = { error: 'wrong_game' };
    status = 403;
    await expect(vatar.verify('signed-token-example')).rejects.toThrow('invalid');
  });
  it('checks Vatar game, environment and expiry, and fails closed on outages', async () => {
    const valid = {
      playerId: 'p_abc',
      name: 'Ada',
      gameId: 'game1',
      mode: 'live',
      exp: Date.now() + 60000,
    };
    let response: unknown = valid;
    let offline = false;
    const request: typeof fetch = async () => {
      if (offline) throw new Error('offline');
      return new Response(JSON.stringify(response), { status: 200 });
    };
    const vatar = new Auth('vatar', store, 'vtr_live_example', 'game1', request);
    expect((await vatar.verify('signed-token-example')).id).toBe('p_abc');
    for (const invalid of [
      { ...valid, gameId: 'other' },
      { ...valid, mode: 'test' },
      { ...valid, exp: 0 },
      {},
    ]) {
      response = invalid;
      await expect(vatar.verify('signed-token-example')).rejects.toThrow('invalid');
    }
    offline = true;
    await expect(vatar.verify('signed-token-example')).rejects.toThrow('could not verify');
    await expect(new Auth('disabled', store).issueLocal()).rejects.toThrow('disabled');
  });
});

function nextSnapshot(
  room: Room,
  predicate: (s: Snapshot) => boolean = () => true,
): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error('Snapshot timed out'));
    }, 5000);
    const off = room.onMessage('snapshot', (input: unknown) => {
      const view = snapshotSchema.parse(input);
      if (predicate(view)) {
        clearTimeout(timer);
        off();
        resolve(view);
      }
    });
  });
}
async function join(code: string, token: string): Promise<Room> {
  const response = await fetch(`http://127.0.0.1:${server.port}/api/friends/${code}/connect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  const room = await new Client(`ws://127.0.0.1:${server.port}`).joinById(code, {
    code,
    session: token,
  });
  room.reconnection.enabled = false;
  return room;
}
it('plays through two real WebSocket clients, broadcasts turns, and resumes the same seat', async () => {
  const one = await auth.issueLocal(),
    two = await auth.issueLocal();
  const response = await fetch(`http://127.0.0.1:${server.port}/api/friends`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${one.token}` },
  });
  const { code } = (await response.json()) as { code: string };
  const a = await join(code, one.token);
  const waiting = nextSnapshot(a);
  a.send('ready');
  expect((await waiting).phase).toBe('waiting');
  const aStarted = nextSnapshot(a, (s) => s.phase === 'playing');
  const b = await join(code, two.token);
  const bStarted = nextSnapshot(b);
  b.send('ready');
  const initial = await aStarted;
  expect((await bStarted).turn).toBe(1);
  const aTurn = nextSnapshot(a, (s) => s.history.length === 1),
    bTurn = nextSnapshot(b, (s) => s.history.length === 1);
  const reply = new Promise<void>((resolve, reject) => {
    a.onMessage('reply', (input: unknown) => {
      const r = replySchema.parse(input);
      if (r.ok) resolve();
      else reject(new Error(r.error));
    });
  });
  a.send('action', command(initial.revision));
  await reply;
  expect((await aTurn).turn).toBe(1);
  expect((await bTurn).turn).toBe(0);
  await a.leave();
  const resumed = await join(code, one.token);
  const restored = nextSnapshot(resumed);
  resumed.send('ready');
  expect((await restored).history).toHaveLength(1);
  await resumed.leave();
  await b.leave();
}, 15000);

describe('active games and head-to-head records', () => {
  it('lists only the authenticated player’s active games, without private game state', async () => {
    const issued = await auth.issueLocal();
    const identity = await auth.verify(issued.token);
    const game = await matches.create(identity);
    const expired = await matches.create(identity);
    await store.save({ ...expired, expiresAt: Date.now() - 1, revision: 1 }, 0);
    const otherEnvironment = new Matches(store, dictionary, 'test');
    await otherEnvironment.create(identity);
    const result = await fetch(`http://127.0.0.1:${server.port}/api/friends`, {
      headers: { Authorization: `Bearer ${issued.token}` },
    });
    const body = await result.json();
    expect(result.status).toBe(200);
    expect(body.games.map((g: { code: string }) => g.code)).toEqual([game.code]);
    expect(body.games[0]).toMatchObject({ phase: 'waiting', opponent: null, scores: [0, 0] });
    expect(Object.keys(body.games[0]).sort()).toEqual([
      'code',
      'opponent',
      'phase',
      'scores',
      'updatedAt',
      'yourTurn',
    ]);
    expect((await fetch(`http://127.0.0.1:${server.port}/api/friends`)).status).toBe(401);
  });
  it('counts completed results from either seat, keeps expired results, and rejects outsiders', async () => {
    const a = { id: 'record-a', name: 'Ada' },
      b = { id: 'record-b', name: 'Bayo' };
    const live = await matches.join((await matches.create(a)).code, b);
    for (const [host, guest, scores] of [
      [a, b, [120, 90]],
      [b, a, [130, 100]],
      [a, b, [80, 80]],
    ] as const) {
      const g = await matches.join((await matches.create(host)).code, guest);
      await store.save(
        {
          ...g,
          revision: g.revision + 1,
          expiresAt: Date.now() - 1,
          game: { ...g.game, status: 'finished', endReason: 'scoreless', scores: [...scores] },
        },
        g.revision,
      );
    }
    const record = await matches.record(live.code, a.id);
    expect(record).toMatchObject({ opponent: 'Bayo', played: 3, wins: 1, losses: 1, draws: 1 });
    expect(record.recent).toHaveLength(3);
    expect((await matches.list(a.id, false, 0)).games.map((g) => g.code)).toEqual([live.code]);
    expect((await matches.list(a.id, true, 0)).games).toHaveLength(3);
    expect((await matches.record(live.code, b.id)).recent.map((g) => g.scores)).toEqual(
      record.recent.map((g) => [g.scores[1], g.scores[0]]),
    );
    await expect(matches.record(live.code, playerC.id)).rejects.toThrow('not available');
    await expect(new Matches(store, dictionary, 'live').record(live.code, a.id)).rejects.toThrow(
      'not available',
    );
    expect((await matches.record(record.recent[0].code, a.id)).played).toBe(3);
  });
});
