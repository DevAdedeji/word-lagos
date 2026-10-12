import { readFileSync } from 'node:fs';
import wordListPath from 'word-list';
import { expect, it } from 'vitest';
import {
  emptyBoard,
  availableBag,
  createGame,
  evaluateMove,
  exchangeTiles,
  makeLexicon,
  passTurn,
  playMove,
} from './index';
import { buildTrie, findBotMove } from './bot';
it('plays a complete game with the shipped dictionary while conserving every tile', () => {
  const dictionary = makeLexicon(
    readFileSync(new URL('../../../apps/web/public/words.txt', import.meta.url), 'utf8'),
  );
  const trie = buildTrie(dictionary);
  let game = createGame('computer', 528);
  for (let turn = 0; turn < 180 && game.status === 'playing'; turn++) {
    const rack = game.racks[game.turn];
    const move = findBotMove(game.board, rack, dictionary, trie);
    if (move) {
      expect(evaluateMove(game.board, rack, move.placements, dictionary).ok).toBe(true);
      game = playMove(game, move.placements, dictionary);
    } else
      game =
        availableBag(game, game.turn).length >= 7
          ? exchangeTiles(
              game,
              rack.map((t) => t.id),
            )
          : passTurn(game);
    const ids = [
      ...game.bag,
      ...game.racks.flat(),
      ...game.board.flat().filter((t) => t !== null),
    ].map((t) => t.id);
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
  }
  expect(game.status).toBe('finished');
  expect(game.history.length).toBeGreaterThan(10);
}, 20000);

it('adds reviewed English words without dropping any previously valid words', () => {
  const text = readFileSync(new URL('../../../apps/web/public/words.txt', import.meta.url), 'utf8');
  const dictionary = makeLexicon(text);
  for (const word of makeLexicon(readFileSync(wordListPath, 'utf8'))) {
    expect(dictionary.has(word), word).toBe(true);
  }
  for (const word of ['SELFIE', 'EMOJI', 'CODEBASE', 'CROWDFUND', 'LIVESTREAM', 'CRYPTOCURRENCY']) {
    expect(dictionary.has(word)).toBe(true);
  }
  expect(dictionary.has('ZZZZZZZ')).toBe(false);
  expect(dictionary.size).toBe(270569);
  const words = text.split('\n');
  expect(words.every((word) => /^[a-z]{2,15}$/.test(word))).toBe(true);
  expect(words).toEqual([...new Set(words)].sort());
});

it('scores a newly accepted word and makes it available to the computer search', () => {
  const dictionary = makeLexicon(
    readFileSync(new URL('../../../apps/web/public/words.txt', import.meta.url), 'utf8'),
  );
  const rack = [...'EMOJI'].map((letter, i) => ({ id: String(i), letter }));
  const placements = rack.map((tile, i) => ({
    tileId: tile.id,
    letter: tile.letter,
    row: 7,
    col: 7 + i,
  }));
  expect(evaluateMove(emptyBoard(), rack, placements, dictionary)).toMatchObject({
    ok: true,
    score: 30,
  });
  const move = findBotMove(emptyBoard(), rack, dictionary, undefined, 'best');
  expect(move).not.toBeNull();
  const result = evaluateMove(emptyBoard(), rack, move!.placements, dictionary);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.score).toBeGreaterThanOrEqual(30);
});
