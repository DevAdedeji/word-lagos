import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, passTurn } from '@word-lagos/game-core';
import { loadGame, saveGame } from './storage';
const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => stored.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('saved games', () => {
  it('restores the exact game, including a pending computer turn', () => {
    const game = passTurn(createGame('computer', 10));
    expect(saveGame(game)).toBe(true);
    expect(loadGame()).toEqual(game);
  });
  it('ignores corrupt or incompatible saves', () => {
    stored.set('word-lagos:game:v1', 'not JSON');
    expect(loadGame()).toBeNull();
    const game = createGame('computer', 1);
    stored.set('word-lagos:game:v1', JSON.stringify({ ...game, version: 0 }));
    expect(loadGame()).toBeNull();
  });
  it('does not restore retired practice games', () => {
    const game = createGame('computer', 1);
    stored.set('word-lagos:game:v1', JSON.stringify({ ...game, mode: 'practice' }));
    expect(loadGame()).toBeNull();
  });
  it('rejects a save with duplicated or missing tiles', () => {
    const game = createGame('computer', 1);
    game.bag[1] = game.bag[0];
    saveGame(game);
    expect(loadGame()).toBeNull();
  });
  it('handles storage being unavailable without interrupting play', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(loadGame()).toBeNull();
    expect(saveGame(createGame('computer', 1))).toBe(false);
  });
});
