import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { startServer } from './server';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { makeLexicon } from '@word-lagos/game-core';
import { z } from 'zod';
import { Auth } from './auth';
import { Matches } from './matches';
import { openStore } from './store';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) loadEnvFile(envPath);
const production = process.env.NODE_ENV === 'production';
const config = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(43128),
    AUTH_MODE: z.enum(['local', 'vatar', 'disabled']).default(production ? 'disabled' : 'local'),
    DATABASE_URL: z.string().optional(),
    VATAR_SECRET: z.string().optional(),
    VATAR_GAME_ID: z.string().optional(),
    PUBLIC_ORIGIN: z.url().optional(),
  })
  .parse(process.env);
if (production && config.AUTH_MODE === 'local')
  throw new Error('Local player sessions cannot be enabled in production.');
if (
  config.AUTH_MODE === 'vatar' &&
  (!config.VATAR_SECRET?.match(/^vtr_(test|live)_/) ||
    !config.DATABASE_URL ||
    !config.PUBLIC_ORIGIN)
)
  throw new Error('Vatar mode requires VATAR_SECRET, DATABASE_URL, and PUBLIC_ORIGIN.');
if (production && config.PUBLIC_ORIGIN && new URL(config.PUBLIC_ORIGIN).protocol !== 'https:')
  throw new Error('Production requires an HTTPS public origin.');
const store = await openStore(
  config.DATABASE_URL,
  production ? undefined : fileURLToPath(new URL('../.data', import.meta.url)),
);
const dictionary = makeLexicon(
  await readFile(new URL('../../web/public/words.txt', import.meta.url), 'utf8'),
);
const auth = new Auth(config.AUTH_MODE, store, config.VATAR_SECRET, config.VATAR_GAME_ID);
const matches = new Matches(
  store,
  dictionary,
  config.AUTH_MODE === 'vatar'
    ? config.VATAR_SECRET!.startsWith('vtr_test_')
      ? 'test'
      : 'live'
    : 'local',
);
const server = await startServer({
  store,
  auth,
  matches,
  port: config.PORT,
  production,
  publicOrigin: config.PUBLIC_ORIGIN,
});
console.info(
  JSON.stringify({ event: 'server_ready', port: server.port, authMode: config.AUTH_MODE }),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.close();
  await store.close();
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
