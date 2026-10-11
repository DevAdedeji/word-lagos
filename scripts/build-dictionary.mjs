import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import wordListPath from 'word-list';
const words = (await readFile(wordListPath, 'utf8'))
  .split(/\r?\n/)
  .filter((word) => /^[a-z]{2,15}$/.test(word));
await mkdir('apps/web/public', { recursive: true });
await writeFile('apps/web/public/words.txt', words.join('\n'));
await copyFile('node_modules/word-list/license', 'apps/web/public/dictionary-license.txt');
console.log(`Prepared ${words.length.toLocaleString()} English words (word-list 4.1.0).`);
