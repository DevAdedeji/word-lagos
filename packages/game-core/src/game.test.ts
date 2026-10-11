import { describe, expect, it } from 'vitest';
import {
  createGame,
  emptyBoard,
  evaluateMove,
  exchangeTiles,
  passTurn,
  playMove,
  type Game,
  type Placement,
  type Tile,
} from './index';
import { findBotMove } from './bot';
const dict = new Set([
  'AT',
  'CAT',
  'CATS',
  'DOG',
  'DOGS',
  'TO',
  'GO',
  'DO',
  'AN',
  'ANT',
  'ON',
  'NO',
  'IN',
  'IT',
  'IS',
  'AS',
  'SAT',
  'RAT',
  'RATS',
  'ART',
  'ARTS',
  'STAR',
  'TAR',
  'TARS',
  'START',
  'STARTER',
  'READ',
  'DEAR',
  'DARE',
  'RED',
  'ARE',
  'EAR',
  'TEA',
  'EAT',
  'ATE',
  'SEA',
  'SEAT',
  'RATE',
  'RATED',
  'STARE',
  'TRAIN',
  'TRAINS',
  'RETAINS',
  'NA',
  'BA',
  'DAD',
]);
const rack = (letters: string): Tile[] =>
  [...letters].map((letter, i) => ({ id: `test${i}`, letter }));
const move = (tiles: Tile[], word: string, row = 7, col = 7, vertical = false): Placement[] =>
  [...word].map((letter, i) => ({
    tileId: tiles[i].id,
    letter,
    row: row + (vertical ? i : 0),
    col: col + (vertical ? 0 : i),
  }));
function fixture(letters = 'CATSEAR'): Game {
  return { ...createGame('computer', 42), racks: [rack(letters), rack('DOGSANT')] };
}
describe('word placement and scoring', () => {
  it('doubles the opening word on the centre square', () => {
    const tiles = rack('CAT');
    const result = evaluateMove(emptyBoard(), tiles, move(tiles, 'CAT'), dict);
    expect(result).toMatchObject({ ok: true, score: 10, words: [{ word: 'CAT', score: 10 }] });
  });
  it('requires the first word to cover the centre', () => {
    const tiles = rack('CAT');
    expect(evaluateMove(emptyBoard(), tiles, move(tiles, 'CAT', 0, 0), dict)).toMatchObject({
      ok: false,
      error: expect.stringContaining('centre'),
    });
  });
  it('rejects a diagonal move', () => {
    const tiles = rack('AT');
    const placements = move(tiles, 'AT');
    placements[1].row++;
    expect(evaluateMove(emptyBoard(), tiles, placements, dict)).toMatchObject({ ok: false });
  });
  it('rejects gaps even if the letters would spell a valid word', () => {
    const tiles = rack('CAT');
    const placements = move(tiles, 'CAT');
    placements[2].col++;
    expect(evaluateMove(emptyBoard(), tiles, placements, dict)).toMatchObject({
      ok: false,
      error: expect.stringContaining('gaps'),
    });
  });
  it('rejects disconnected words', () => {
    const game = playMove(fixture(), move(rack('CAT'), 'CAT'), dict);
    const tiles = rack('DOG');
    expect(evaluateMove(game.board, tiles, move(tiles, 'DOG', 0, 0), dict)).toMatchObject({
      ok: false,
      error: expect.stringContaining('Connect'),
    });
  });
  it('rejects overwritten and duplicate tiles, forged letters, and out of bounds cells', () => {
    const tiles = rack('CAT');
    const placements = move(tiles, 'CAT');
    for (const bad of [
      [{ ...placements[0], row: 15 }, ...placements.slice(1)],
      [placements[0], { ...placements[1], tileId: placements[0].tileId }, placements[2]],
      [{ ...placements[0], letter: 'Z' }, ...placements.slice(1)],
      [placements[0], { ...placements[1], col: 7 }, placements[2]],
    ])
      expect(evaluateMove(emptyBoard(), tiles, bad, dict).ok).toBe(false);
  });
  it('scores blank tiles at zero even on premium squares', () => {
    const tiles = rack('?AT');
    expect(evaluateMove(emptyBoard(), tiles, move(tiles, 'CAT'), dict)).toMatchObject({
      ok: true,
      score: 4,
    });
  });
  it('supports an existing tile bridging new tiles', () => {
    const board = emptyBoard();
    board[7][7] = { id: 'a', letter: 'A', blank: false };
    const tiles = rack('CT');
    const placements = [
      { tileId: tiles[0].id, letter: 'C', row: 7, col: 6 },
      { tileId: tiles[1].id, letter: 'T', row: 7, col: 8 },
    ];
    expect(evaluateMove(board, tiles, placements, dict)).toMatchObject({ ok: true, score: 5 });
  });
  it('scores both words made by one tile without reusing old premiums', () => {
    const board = emptyBoard();
    board[7][6] = { id: 'a', letter: 'A', blank: false };
    board[6][7] = { id: 'i', letter: 'I', blank: false };
    const tiles = rack('T');
    expect(evaluateMove(board, tiles, move(tiles, 'T'), dict)).toMatchObject({
      ok: true,
      score: 8,
      words: [
        { word: 'AT', score: 4 },
        { word: 'IT', score: 4 },
      ],
    });
  });
  it('rejects a valid main word with an invalid crossing word', () => {
    const board = emptyBoard();
    board[6][8] = { id: 'z', letter: 'Z', blank: false };
    const tiles = rack('CAT');
    expect(evaluateMove(board, tiles, move(tiles, 'CAT'), dict)).toMatchObject({
      ok: false,
      error: expect.stringContaining('ZA'),
    });
  });
  it('checks complete words including existing prefixes and suffixes', () => {
    const board = emptyBoard();
    board[7][6] = { id: 'c', letter: 'C', blank: false };
    board[7][9] = { id: 's', letter: 'S', blank: false };
    const tiles = rack('AT');
    expect(evaluateMove(board, tiles, move(tiles, 'AT'), dict)).toMatchObject({
      ok: true,
      words: [{ word: 'CATS', score: 12 }],
    });
  });
  it('awards 50 extra points for seven new tiles', () => {
    const tiles = rack('RETAINS');
    expect(evaluateMove(emptyBoard(), tiles, move(tiles, 'RETAINS', 7, 4), dict)).toMatchObject({
      ok: true,
      bingo: true,
      score: 64,
    });
  });
  it('accepts vertical words with the same rules', () => {
    const tiles = rack('CAT');
    expect(evaluateMove(emptyBoard(), tiles, move(tiles, 'CAT', 7, 7, true), dict)).toMatchObject({
      ok: true,
      score: 10,
    });
  });
  it('rejects an isolated one-letter word', () => {
    const tiles = rack('A');
    expect(evaluateMove(emptyBoard(), tiles, move(tiles, 'A'), dict).ok).toBe(false);
  });
  it('does not mutate its inputs', () => {
    const board = emptyBoard(),
      tiles = rack('CAT'),
      before = JSON.stringify({ board, tiles });
    evaluateMove(board, tiles, move(tiles, 'CAT'), dict);
    expect(JSON.stringify({ board, tiles })).toBe(before);
  });
});
describe('game lifecycle', () => {
  it('creates reproducible bags and conserves all 100 tiles', () => {
    const g = createGame('computer', 123);
    expect(g).toEqual(createGame('computer', 123));
    expect(g.bag.length).toBe(86);
    expect(new Set([...g.bag, ...g.racks.flat()].map((t) => t.id)).size).toBe(100);
  });
  it('refills a rack and hands over the turn after a valid move', () => {
    const g = playMove(fixture(), move(rack('CAT'), 'CAT'), dict);
    expect(g.scores).toEqual([10, 0]);
    expect(g.turn).toBe(1);
    expect(g.racks[0]).toHaveLength(7);
    expect(g.bag).toHaveLength(83);
  });
  it('swaps selected tiles, consumes the turn, and conserves the bag', () => {
    const original = createGame('computer', 19),
      ids = original.racks[0].slice(0, 2).map((t) => t.id);
    const g = exchangeTiles(original, ids);
    expect(g.bag).toHaveLength(original.bag.length);
    expect(g.turn).toBe(1);
    expect(g.racks[0].some((t) => ids.includes(t.id))).toBe(false);
    expect(g.bag.filter((t) => ids.includes(t.id))).toHaveLength(2);
  });
  it('rejects swapping when fewer than seven bag tiles remain', () => {
    const g = createGame('computer', 3);
    g.bag = g.bag.slice(0, 6);
    expect(() => exchangeTiles(g, [g.racks[0][0].id])).toThrow('seven');
  });
  it('rejects empty, repeated, and foreign tile selections', () => {
    const g = createGame('computer', 3);
    for (const ids of [[], ['fake'], [g.racks[0][0].id, g.racks[0][0].id]])
      expect(() => exchangeTiles(g, ids)).toThrow();
  });
  it('ends after six consecutive scoreless turns and deducts leftover tiles', () => {
    let g = fixture('AT');
    g.scores = [20, 20];
    g.racks[1] = rack('DOG');
    for (let i = 0; i < 6; i++) g = passTurn(g);
    expect(g.status).toBe('finished');
    expect(g.scores).toEqual([18, 15]);
    expect(() => passTurn(g)).toThrow();
  });
  it('resets the scoreless counter after scoring', () => {
    const g = { ...fixture(), scoreless: 5 };
    expect(playMove(g, move(rack('CAT'), 'CAT'), dict).scoreless).toBe(0);
  });
  it('deducts and transfers remaining opponent tiles when the last rack is cleared', () => {
    const g = fixture('CAT');
    g.bag = [];
    g.racks[1] = rack('DOG');
    const result = playMove(g, move(g.racks[0], 'CAT'), dict);
    expect(result.status).toBe('finished');
    expect(result.endReason).toBe('rack-empty');
    expect(result.scores).toEqual([15, -5]);
  });
});
describe('computer opponent', () => {
  it('finds a legal opening using its own rack', () => {
    const board = emptyBoard(),
      tiles = rack('CATSEAR');
    const result = findBotMove(board, tiles, dict);
    expect(result).not.toBeNull();
    expect(evaluateMove(board, tiles, result!.placements, dict).ok).toBe(true);
  });
  it('finds connected plays and never overwrites existing tiles', () => {
    const g = playMove(fixture(), move(rack('CAT'), 'CAT'), dict);
    const result = findBotMove(g.board, g.racks[1], dict);
    expect(result).not.toBeNull();
    expect(evaluateMove(g.board, g.racks[1], result!.placements, dict).ok).toBe(true);
  });
  it('uses a blank as a valid letter', () => {
    const tiles = rack('?T');
    const result = findBotMove(emptyBoard(), tiles, new Set(['AT']));
    expect(result).not.toBeNull();
    expect(result?.placements.find((p) => p.tileId === tiles[0].id)?.letter).toBe('A');
  });
  it('returns no move when no word is possible', () => {
    expect(findBotMove(emptyBoard(), rack('ZZZZZZZ'), dict)).toBeNull();
  });
});

it('returns per-word validity and coordinates for live board outlines', () => {
  const board = emptyBoard();
  board[6][8] = { id: 'z', letter: 'Z', blank: false };
  const tiles = rack('CAT');
  const result = evaluateMove(board, tiles, move(tiles, 'CAT'), dict);
  expect(result).toMatchObject({
    ok: false,
    words: [
      {
        word: 'CAT',
        valid: true,
        cells: [
          { row: 7, col: 7 },
          { row: 7, col: 8 },
          { row: 7, col: 9 },
        ],
      },
      {
        word: 'ZA',
        valid: false,
        cells: [
          { row: 6, col: 8 },
          { row: 7, col: 8 },
        ],
      },
    ],
  });
});
