import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createGame, emptyBoard, evaluateMove } from '@word-lagos/game-core';
import { openStore, type Store } from './store';
import { Purchases } from './purchases';
import { Vatar, type Purchase } from './vatar';
import { Matches } from './matches';
import { Hints, findHint } from './hints';
import { findBotMove } from '../../../packages/game-core/src/bot';
import { Auth } from './auth';
import { startServer } from './server';
import type { HintMove } from '@word-lagos/multiplayer';
let store: Store;
beforeAll(async () => {
  store = await openStore();
}, 30000);
afterAll(async () => {
  await store.close();
});
const player = () => randomUUID();
const move: HintMove = {
  placements: [
    { tileId: 'a', letter: 'A', row: 7, col: 7 },
    { tileId: 't', letter: 'T', row: 7, col: 8 },
  ],
  score: 4,
  words: ['AT'],
};
const input = {
  kind: 'computer' as const,
  board: emptyBoard(),
  rack: [
    { id: 'a', letter: 'A' },
    { id: 't', letter: 'T' },
  ],
};
const purchase = (id = player(), owner = player()): Purchase => ({
  id,
  playerId: owner,
  productId: 'diamonds_100',
  amount: 500,
  currency: 'NGN',
  mode: 'test',
  status: 'paid',
});
describe('diamond balances and purchase delivery', () => {
  it('grants the welcome gift once under concurrent initialization and separates environments', async () => {
    const p = player();
    expect(
      await Promise.all(Array.from({ length: 4 }, () => store.diamonds.initialize(p, 'test'))),
    ).toEqual([10, 10, 10, 10]);
    expect(await store.diamonds.balance(p, 'live')).toBe(0);
    expect(await store.diamonds.initialize(p, 'live')).toBe(10);
  });
  it('credits a consumable once per purchase ID, including repeated delivery after timeout', async () => {
    const p = purchase();
    let fails = true;
    const provider = new Vatar('vtr_test_example', undefined, async (url) => {
      if (String(url).endsWith('/deliver')) {
        if (fails) throw new Error('offline');
        return Response.json({ id: p.id, status: 'delivered' });
      }
      return Response.json(p);
    });
    const purchases = new Purchases(store, provider);
    await expect(purchases.claim(p.playerId, p.id)).rejects.toThrow('unavailable');
    expect(await store.diamonds.balance(p.playerId, 'test')).toBe(110);
    fails = false;
    await Promise.all([purchases.claim(p.playerId, p.id), purchases.claim(p.playerId, p.id)]);
    expect(await store.diamonds.balance(p.playerId, 'test')).toBe(110);
    expect(await purchases.ownedThemes(p.playerId)).toEqual([]);
    const second = { ...p, id: player() };
    await store.diamonds.grant(second, 100);
    expect(await store.diamonds.balance(p.playerId, 'test')).toBe(210);
  });
  it('rejects wrong owners, amounts and environments', async () => {
    const p = purchase();
    let value = { ...p };
    const purchases = new Purchases(
      store,
      new Vatar('vtr_test_key', undefined, async () => Response.json(value)),
    );
    await expect(purchases.claim(player(), p.id)).rejects.toThrow('belong');
    value = { ...p, amount: 100 };
    await expect(purchases.claim(p.playerId, p.id)).rejects.toThrow('belong');
    value = { ...p, mode: 'live' };
    await expect(purchases.claim(p.playerId, p.id)).rejects.toThrow('verified');
    expect(await store.diamonds.balance(p.playerId, 'test')).toBe(0);
  });
  it('reverses a refunded pack once and preserves spent-diamond debt', async () => {
    const p = purchase();
    await store.diamonds.grant(p, 100);
    for (let i = 0; i < 11; i++) await store.diamonds.spend(p.playerId, 'test', String(i), move);
    await Promise.all([store.diamonds.refund(p.id, 'test'), store.diamonds.refund(p.id, 'test')]);
    expect(await store.diamonds.balance(p.playerId, 'test')).toBe(-100);
    await expect(store.diamonds.grant(p, 100)).rejects.toThrow('cannot be credited');
    await expect(store.diamonds.spend(p.playerId, 'test', 'new', move)).rejects.toThrow('need 10');
  });
  it('remembers refunds received before any credit', async () => {
    const p = { ...purchase(), status: 'refunded' as const };
    const purchases = new Purchases(
      store,
      new Vatar('vtr_test_key', undefined, async () => Response.json(p)),
    );
    await expect(purchases.claim(p.playerId, p.id)).rejects.toThrow('refunded');
    await expect(store.diamonds.grant({ ...p, status: 'paid' }, 100)).rejects.toThrow(
      'cannot be credited',
    );
    expect(await store.diamonds.balance(p.playerId, 'test')).toBe(10);
  });
  it('allows only one competing spend of the last 10 diamonds', async () => {
    const p = player();
    const results = await Promise.allSettled([
      store.diamonds.spend(p, 'local', 'first', move),
      store.diamonds.spend(p, 'local', 'second', move),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await store.diamonds.balance(p, 'local')).toBe(0);
  });
  it('deduplicates concurrent same-hint requests across instances', async () => {
    const p = player();
    const results = await Promise.all([
      store.diamonds.spend(p, 'local', 'same', move),
      store.diamonds.spend(p, 'local', 'same', move),
    ]);
    expect(results.map((r) => r.charged).sort()).toEqual([false, true]);
    expect(results.map((r) => r.balance)).toEqual([0, 0]);
  });
});
describe('hint safety', () => {
  it('returns the same paid hint without another charge, even after rack shuffle', async () => {
    const p = player();
    let calls = 0;
    const hints = new Hints(store, new Matches(store, new Set()), 'local', async () => {
      calls++;
      return move;
    });
    expect(await hints.request(p, input)).toMatchObject({ balance: 0, charged: true, move });
    expect(await hints.request(p, { ...input, rack: [...input.rack].reverse() })).toMatchObject({
      balance: 0,
      charged: false,
      move,
    });
    expect(calls).toBe(1);
  });
  it('does not charge when no move is found or a search fails', async () => {
    const p = player();
    const hints = new Hints(store, new Matches(store, new Set()), 'local', async () => null);
    expect(await hints.request(p, input)).toMatchObject({
      balance: 10,
      charged: false,
      move: null,
    });
    const broken = new Hints(store, new Matches(store, new Set()), 'local', async () => {
      throw new Error('busy');
    });
    await expect(broken.request(p, input)).rejects.toThrow('busy');
    expect(await store.diamonds.balance(p, 'local')).toBe(10);
  });
  it('checks multiplayer membership, turn, revision and environment', async () => {
    const matches = new Matches(store, new Set());
    const a = { id: player(), name: 'A' },
      b = { id: player(), name: 'B' };
    const m = await matches.join((await matches.create(a)).code, b);
    const hints = new Hints(store, matches, 'local', async () => move);
    const request = { kind: 'friend', code: m.code, revision: m.revision };
    await expect(hints.request(player(), request)).rejects.toThrow('not available');
    await expect(hints.request(b.id, request)).rejects.toThrow('your turn');
    await expect(hints.request(a.id, { ...request, revision: 0 })).rejects.toThrow('changed');
    await expect(
      new Hints(store, matches, 'test', async () => move).request(a.id, request),
    ).rejects.toThrow('not available');
    await store.save({ ...m, expiresAt: Date.now() - 1 }, m.revision);
    await expect(hints.request(a.id, request)).rejects.toThrow('expired');
  });
  it('does not charge if a multiplayer game changes while the search runs', async () => {
    const matches = new Matches(store, new Set());
    const a = { id: player(), name: 'A' },
      b = { id: player(), name: 'B' };
    const m = await matches.join((await matches.create(a)).code, b);
    const hints = new Hints(store, matches, 'local', async () => {
      await matches.act(m.code, b.id, {
        id: randomUUID(),
        revision: m.revision,
        action: { kind: 'resign' },
      });
      return move;
    });
    await expect(
      hints.request(a.id, { kind: 'friend', code: m.code, revision: m.revision }),
    ).rejects.toThrow(/changed|your turn/);
    expect(await store.diamonds.balance(a.id, 'local')).toBe(10);
  });
  it('finds and validates a real word using the production worker', async () => {
    const game = createGame('computer', 1234);
    const hint = await findHint(game.board, game.racks[0]);
    expect(hint).not.toBeNull();
    const result = evaluateMove(game.board, game.racks[0], hint!.placements, new Set(hint!.words));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.score).toBe(hint!.score);
  }, 15000);
});

describe('automatic best-word play', () => {
  it('uses the highest-scoring move, including premiums and the seven-tile bonus', () => {
    const rack = [...'LETTERS'].map((letter, i) => ({ id: String(i), letter }));
    const dictionary = new Set([
      'LETTERS',
      'LETTER',
      'LET',
      'SET',
      'TREE',
      'TREES',
      'REST',
      'TEST',
    ]);
    const best = findBotMove(emptyBoard(), rack, dictionary, undefined, 'best');
    expect(best?.placements).toHaveLength(7);
    expect(best?.score).toBe(66);
  });
  it('saves the played board and charges once, and a lost-response retry cannot play twice', async () => {
    const matches = new Matches(store, new Set(['AT']));
    const a = { id: player(), name: 'A' },
      b = { id: player(), name: 'B' };
    let m = await matches.join((await matches.create(a)).code, b);
    m = { ...m, game: { ...m.game, racks: [input.rack, m.game.racks[1]] } };
    await store.save(m, m.revision);
    const hints = new Hints(store, matches, 'local', async () => move);
    const request = { kind: 'friend', code: m.code, revision: m.revision };
    expect(await hints.request(a.id, request)).toMatchObject({ charged: true, balance: 0 });
    const played = await store.get(m.code);
    expect(played?.game.board[7][7]?.letter).toBe('A');
    expect(played?.game.board[7][8]?.letter).toBe('T');
    expect(played?.game.turn).toBe(1);
    expect(played?.game.scores[0]).toBe(4);
    expect(played?.revision).toBe(m.revision + 1);
    expect(await hints.request(a.id, request)).toMatchObject({ charged: false, balance: 0 });
    expect((await store.get(m.code))?.game.history).toHaveLength(1);
  });
  it('rolls back both the board and debit when there are not enough diamonds', async () => {
    const matches = new Matches(store, new Set(['AT']));
    const a = { id: player(), name: 'A' },
      b = { id: player(), name: 'B' };
    let m = await matches.join((await matches.create(a)).code, b);
    m = { ...m, game: { ...m.game, racks: [input.rack, m.game.racks[1]] } };
    await store.save(m, m.revision);
    const hints = new Hints(store, matches, 'local', async () => {
      await store.diamonds.spend(a.id, 'local', 'other-game', move);
      return move;
    });
    await expect(
      hints.request(a.id, { kind: 'friend', code: m.code, revision: m.revision }),
    ).rejects.toThrow('need 10');
    expect((await store.get(m.code))?.revision).toBe(m.revision);
    expect((await store.get(m.code))?.game.board[7][7]).toBeNull();
  });
});

it('protects wallet and purchase endpoints and makes a demo pack retry idempotent', async () => {
  const auth = new Auth('local', store);
  const server = await startServer({ store, auth, matches: new Matches(store, new Set()) });
  const base = `http://127.0.0.1:${server.port}`;
  try {
    expect((await fetch(`${base}/api/diamonds/wallet`, { method: 'POST' })).status).toBe(401);
    const { token } = await auth.issueLocal();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const init = await fetch(`${base}/api/diamonds/wallet`, { method: 'POST', headers });
    expect(init.headers.get('cache-control')).toBe('no-store');
    expect(await init.json()).toEqual({ balance: 10, demo: true });
    const body = JSON.stringify({ id: randomUUID(), productId: 'diamonds_100' });
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/api/diamonds/demo`, { method: 'POST', headers, body });
      expect(await response.json()).toEqual({ balance: 110, demo: true });
    }
    const bad = await fetch(`${base}/api/diamonds/hint`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, price: 0 }),
    });
    expect(bad.status).toBe(400);
    const { token: other } = await auth.issueLocal();
    const isolated = await fetch(`${base}/api/diamonds/wallet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${other}` },
    });
    expect(await isolated.json()).toEqual({ balance: 10, demo: true });
  } finally {
    await server.close();
  }
});
