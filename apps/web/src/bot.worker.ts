import { makeLexicon, type Board, type Tile } from '@word-lagos/game-core';
import { buildTrie, findBotMove } from '../../../packages/game-core/src/bot';
let dictionary: Set<string> | undefined;
let trie: ReturnType<typeof buildTrie> | undefined;
self.onmessage = (
  event: MessageEvent<{ id: number; board: Board; rack: Tile[]; words?: string }>,
) => {
  const { id, board, rack, words } = event.data;
  try {
    if (words) {
      dictionary = makeLexicon(words);
      trie = buildTrie(dictionary);
    }
    if (!dictionary || !trie) throw new Error('The computer’s dictionary is not ready.');
    const move = findBotMove(board, rack, dictionary, trie);
    self.postMessage({ id, move });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'The computer could not choose a move.',
    });
  }
};
