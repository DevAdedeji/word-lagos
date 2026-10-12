import { readFile, writeFile, mkdir } from 'node:fs/promises';
import wordListPath from 'word-list';
const base = (await readFile(wordListPath, 'utf8'))
  .split(/\r?\n/)
  .filter((word) => /^[a-z]{2,15}$/.test(word));
const supplement = (await readFile('data/dictionary/english-supplement.txt', 'utf8'))
  .trim()
  .split(/\r?\n/);
if (supplement.some((word) => !/^[a-z]{2,15}$/.test(word))) {
  throw new Error('The English supplement must contain only lowercase words of 2–15 letters.');
}
const words = [...new Set([...base, ...supplement])].sort();
await mkdir('apps/web/public', { recursive: true });
await writeFile('apps/web/public/words.txt', words.join('\n'));
const notices = await Promise.all([
  readFile('node_modules/word-list/license', 'utf8'),
  readFile('data/dictionary/SCOWL-Copyright.txt', 'utf8'),
]);
await writeFile(
  'apps/web/public/dictionary-license.txt',
  `WordPadi English: word-list 4.1.0 + reviewed SCOWL 2026.02.25 additions.\n\n${notices.map((notice) => notice.trimEnd()).join('\n\n')}\n`,
);
console.log(
  `Prepared ${words.length.toLocaleString()} English words (${words.length - base.length} additions).`,
);
