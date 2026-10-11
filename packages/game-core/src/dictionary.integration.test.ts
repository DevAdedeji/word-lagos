import { readFileSync } from 'node:fs';
import wordListPath from 'word-list';
import { expect, it } from 'vitest';
import { createGame, evaluateMove, exchangeTiles, makeLexicon, passTurn, playMove } from './index';
import { buildTrie, findBotMove } from './bot';
it('plays a complete game with the shipped dictionary while conserving every tile', () => {
  const dictionary = makeLexicon(readFileSync(wordListPath, 'utf8'));
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
        game.bag.length >= 7
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
    expect(ids).toHaveLength(100);
    expect(new Set(ids).size).toBe(100);
  }
  expect(game.status).toBe('finished');
  expect(game.history.length).toBeGreaterThan(10);
}, 20000);
