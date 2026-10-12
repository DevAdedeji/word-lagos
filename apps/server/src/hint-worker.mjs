import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
const { makeLexicon, evaluateMove } = await tsImport(
  '../../../packages/game-core/src/index.ts',
  import.meta.url,
);
const { findBotMove } = await tsImport('../../../packages/game-core/src/bot.ts', import.meta.url);
const dictionary = makeLexicon(
  await readFile(new URL('../../web/public/words.txt', import.meta.url), 'utf8'),
);
const result = findBotMove(workerData.board, workerData.rack, dictionary, undefined, 'best');
if (!result) parentPort.postMessage(null);
else {
  const checked = evaluateMove(workerData.board, workerData.rack, result.placements, dictionary);
  if (!checked.ok) throw new Error('Invalid hint');
  parentPort.postMessage({
    placements: result.placements,
    score: checked.score,
    words: checked.words.map((w) => w.word),
  });
}
