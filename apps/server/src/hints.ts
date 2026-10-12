import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import type { Board, Tile } from '@word-lagos/game-core';
import {
  HINT_COST,
  hintMoveSchema,
  hintRequestSchema,
  type HintMove,
} from '@word-lagos/multiplayer';
import type { Store } from './store';
import { DiamondError, type Environment } from './diamonds-store';
import type { Matches } from './matches';
export type FindHint = (board: Board, rack: Tile[]) => Promise<HintMove | null>;
let searches = 0;
export const findHint: FindHint = (board, rack) => {
  if (searches >= 2)
    return Promise.reject(
      new DiamondError('Automatic plays are busy. Try again shortly; no diamonds were spent.'),
    );
  searches++;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./hint-worker.mjs', import.meta.url), {
      workerData: { board, rack },
    });
    let settled = false;
    const finish = (error?: Error, move: HintMove | null = null) => {
      if (settled) return;
      settled = true;
      searches--;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(move);
    };
    const timer = setTimeout(
      () => finish(new DiamondError('The word search timed out. No diamonds were spent.')),
      10000,
    );
    worker.once('message', (value: unknown) => {
      const parsed = hintMoveSchema.nullable().safeParse(value);
      if (parsed.success) finish(undefined, parsed.data);
      else finish(new DiamondError('Could not find a word. No diamonds were spent.'));
    });
    worker.once('error', () =>
      finish(new DiamondError('The word service is unavailable. No diamonds were spent.')),
    );
    worker.once('exit', () => {
      if (!settled) finish(new DiamondError('The word service stopped. No diamonds were spent.'));
    });
  });
};
export class Hints {
  private pending = new Set<string>();
  constructor(
    private store: Store,
    private matches: Matches,
    private env: Environment,
    private find: FindHint = findHint,
  ) {}
  async request(player: string, raw: unknown) {
    const input = hintRequestSchema.parse(raw);
    const key = createHash('sha256')
      .update(
        JSON.stringify(
          input.kind === 'friend'
            ? { code: input.code, revision: input.revision }
            : {
                board: input.board,
                rack: [...input.rack].sort((a, b) => a.id.localeCompare(b.id)),
              },
        ),
      )
      .digest('hex');
    let board: Board, rack: Tile[], match: { code: string; revision: number } | undefined;
    if (input.kind === 'friend') {
      const saved = await this.matches.get(input.code);
      const seat = saved.players.findIndex((p) => p.id === player);
      if (saved.environment !== this.env || seat < 0)
        throw new DiamondError('This game is not available to you.');
      const previous = await this.store.diamonds.cached(player, this.env, key);
      if (previous)
        return {
          move: previous,
          balance: await this.store.diamonds.balance(player, this.env),
          charged: false,
        };
      if (saved.players.length !== 2 || saved.game.status !== 'playing' || saved.game.turn !== seat)
        throw new DiamondError('Play a word is available on your turn in an active game.');
      if (saved.revision !== input.revision)
        throw new DiamondError('The board changed. Try again.');
      board = saved.game.board;
      rack = saved.game.racks[seat];
      match = { code: input.code, revision: input.revision };
    } else {
      board = input.board;
      rack = input.rack;
      const tiles = [...board.flat().filter((t) => t !== null), ...rack];
      if (
        new Set(tiles.map((t) => t.id)).size !== tiles.length ||
        board.flat().some((t) => t?.letter === '?')
      )
        throw new DiamondError('This board could not be checked. Reload your game.');
    }
    const cached = await this.store.diamonds.cached(player, this.env, key);
    if (cached)
      return {
        move: cached,
        balance: await this.store.diamonds.balance(player, this.env),
        charged: false,
      };
    const balance = await this.store.diamonds.initialize(player, this.env);
    if (balance < HINT_COST) throw new DiamondError('You need 10 diamonds to play a word.');
    if (this.pending.has(player))
      throw new DiamondError('Your word is already being prepared. Please wait.');
    this.pending.add(player);
    try {
      const move = await this.find(board, rack);
      if (!move)
        return {
          move: null,
          balance: await this.store.diamonds.balance(player, this.env),
          charged: false,
        };
      const next = match
        ? await this.matches.prepareAutomaticPlay(
            match.code,
            player,
            match.revision,
            move.placements,
          )
        : undefined;
      return await this.store.diamonds.spend(
        player,
        this.env,
        key,
        move,
        match && next ? { ...match, next } : undefined,
      );
    } finally {
      this.pending.delete(player);
    }
  }
}
