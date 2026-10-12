import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { winnerOf } from '@word-lagos/game-core';
import { openStore, type Store } from './store';
import { Matches, snapshot } from './matches';
import { Purchases } from './purchases';
import { Vatar } from './vatar';
let store: Store, matches: Matches;
beforeAll(async () => {
  store = await openStore();
  matches = new Matches(store, new Set());
}, 30000);
afterAll(async () => store.close());
const person = () => ({ id: randomUUID(), name: 'Padi' });
const resign = (revision: number) => ({ id: randomUUID(), revision, action: { kind: 'resign' } });
describe('resignations, rematches and statistics', () => {
  it('lets the non-turn player resign, preserves scores, and counts the opponent as winner', async () => {
    const a = person(),
      b = person();
    let m = await matches.join((await matches.create(a)).code, b);
    m = { ...m, game: { ...m.game, scores: [12, 200] } };
    await store.save(m, m.revision);
    const command = resign(m.revision);
    const done = await matches.act(m.code, b.id, command);
    expect(done.game.scores).toEqual([12, 200]);
    expect(winnerOf(done.game)).toBe(0);
    expect(snapshot(done, b.id, new Set()).resignedBy).toBe(0);
    expect((await matches.act(m.code, b.id, command)).revision).toBe(done.revision);
    expect(await matches.stats(a.id)).toMatchObject({
      played: 1,
      wins: 1,
      losses: 0,
      draws: 0,
      bestScore: 12,
      yourTurn: 0,
    });
    expect(await matches.stats(b.id)).toMatchObject({ played: 1, wins: 0, losses: 1 });
    expect(await matches.record(m.code, a.id)).toMatchObject({ wins: 1, losses: 0 });
    expect((await matches.list(b.id, true, 0)).games[0]).toMatchObject({
      outcome: 'loss',
      resigned: true,
    });
  });
  it('rejects outsider, waiting, stale and expired resignations', async () => {
    const a = person(),
      b = person(),
      outsider = person();
    let m = await matches.create(a);
    await expect(matches.act(m.code, a.id, resign(m.revision))).rejects.toThrow('Wait');
    m = await matches.join(m.code, b);
    await expect(matches.act(m.code, outsider.id, resign(m.revision))).rejects.toThrow(
      'not a player',
    );
    await expect(matches.act(m.code, a.id, resign(m.revision - 1))).rejects.toThrow(
      'board changed',
    );
    await store.save({ ...m, expiresAt: Date.now() - 1 }, m.revision);
    await expect(matches.act(m.code, a.id, resign(m.revision))).rejects.toThrow('expired');
  });
  it('creates one reserved rematch under concurrent retries from both players', async () => {
    const a = person(),
      b = person();
    const m = await matches.join((await matches.create(a)).code, b);
    await matches.act(m.code, a.id, resign(m.revision));
    const [one, two] = await Promise.all([matches.rematch(m.code, a), matches.rematch(m.code, b)]);
    expect(one.code).toBe(two.code);
    expect(one.game.history).toEqual([]);
    await expect(matches.join(one.code, person())).rejects.toThrow('reserved');
    const invited = one.players[0].id === a.id ? b : a;
    const joined = await matches.join(one.code, invited);
    expect(joined.players).toHaveLength(2);
    expect((await matches.get(m.code)).game.status).toBe('finished');
  });
  it('rejects unfinished, unrelated and cross-environment rematch requests', async () => {
    const a = person(),
      b = person();
    const m = await matches.join((await matches.create(a)).code, b);
    await expect(matches.rematch(m.code, a)).rejects.toThrow('Finish');
    await matches.act(m.code, a.id, resign(m.revision));
    await expect(matches.rematch(m.code, person())).rejects.toThrow('not available');
    await expect(new Matches(store, new Set(), 'test').rematch(m.code, a)).rejects.toThrow(
      'not available',
    );
  });
  it('aggregates moves without counting the opponent, duplicates, expired turns or another environment', async () => {
    const a = person(),
      b = person();
    const m = await matches.join((await matches.create(b)).code, a);
    const ownMove = {
      player: 1,
      kind: 'play' as const,
      words: ['LETTERS'],
      score: 82,
      placements: Array.from({ length: 7 }, (_, i) => ({
        tileId: String(i),
        letter: 'LETTERS'[i],
        row: 7,
        col: i,
      })),
    };
    await store.save(
      {
        ...m,
        game: {
          ...m.game,
          turn: 1,
          history: [ownMove, { ...ownMove, player: 0, score: 150 }],
          scores: [150, 82],
        },
      },
      m.revision,
    );
    const stats = await matches.stats(a.id);
    expect(stats).toMatchObject({
      played: 0,
      bestMove: 82,
      bestWords: ['LETTERS'],
      words: 1,
      bingos: 1,
      yourTurn: 1,
    });
    expect(await matches.stats(a.id)).toEqual(stats);
    await store.save({ ...m, expiresAt: Date.now() - 1 }, m.revision);
    expect((await matches.stats(a.id)).yourTurn).toBe(0);
    expect(await new Matches(store, new Set(), 'test').stats(a.id)).toMatchObject({
      played: 0,
      words: 0,
      yourTurn: 0,
    });
  });
});
describe('separate theme entitlements', () => {
  it('unlocks only the purchased theme and revokes only a refunded theme', async () => {
    const player = person();
    let refund = false;
    const ids = ['midnight_board', 'ankara_board', 'royal_board'];
    const provider = new Vatar('vtr_test_secret', undefined, async (url) => {
      const parts = String(url).split('/');
      const delivering = parts.at(-1) === 'deliver';
      const id = delivering ? parts.at(-2)! : parts.at(-1)!;
      return new Response(
        JSON.stringify(
          delivering
            ? { id, status: 'delivered' }
            : {
                id,
                productId: id,
                playerId: player.id,
                amount: 500,
                currency: 'NGN',
                mode: 'test',
                status: refund && id === 'ankara_board' ? 'refunded' : 'paid',
              },
        ),
      );
    });
    const purchases = new Purchases(store, provider);
    for (const id of ids) await purchases.claim(player.id, id);
    expect(await purchases.ownedThemes(player.id)).toEqual(['midnight', 'ankara', 'royal']);
    expect(await purchases.owned(player.id)).toBe(false);
    refund = true;
    expect(await purchases.ownedThemes(player.id)).toEqual(['midnight', 'royal']);
  });
});

it('persists personal supplies and reveals only the viewer’s remaining count', async () => {
  const a = person(),
    b = person();
  const m = await matches.join((await matches.create(a)).code, b);
  const loaded = await matches.get(m.code);
  expect(loaded.game.tileSupply).toBe('personal-60');
  for (const player of [a, b]) {
    const view = snapshot(loaded, player.id, new Set());
    expect(view.tilesLeft).toBe(60);
    expect(view.bagCount).toBe(53);
    expect(view.opponentRackCount).toBe(7);
    expect(view).not.toHaveProperty('bag');
    expect(view).not.toHaveProperty('racks');
  }
});

it('reports the opponent rack count from the other seat without revealing its contents', async () => {
  const a = person(),
    b = person();
  const m = await matches.join((await matches.create(a)).code, b);
  const view = { ...m, game: { ...m.game, racks: [m.game.racks[0], m.game.racks[1].slice(0, 2)] } };
  expect(snapshot(view, a.id, new Set()).opponentRackCount).toBe(2);
  expect(snapshot(view, b.id, new Set()).opponentRackCount).toBe(7);
  expect(snapshot(await matches.create(a), a.id, new Set()).opponentRackCount).toBe(0);
});
