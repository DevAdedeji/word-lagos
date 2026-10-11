import { createHash, randomInt } from 'node:crypto';
import { createGame, exchangeTiles, passTurn, playMove } from '@word-lagos/game-core';
import {
  commandSchema,
  type Command,
  type Snapshot,
  type GameSummary,
} from '@word-lagos/multiplayer';
import type { Match, Player, Store } from './store';

export class MatchError extends Error {}
export class Matches {
  constructor(
    private store: Store,
    private dictionary: ReadonlySet<string>,
    private environment: 'local' | 'test' | 'live' = 'local',
  ) {}
  async list(playerId: string, completed: boolean, offset: number) {
    const rows = await this.store.list(playerId, this.environment, completed, offset);
    return {
      games: rows.slice(0, 50).map((row) => summary(row, playerId)),
      nextOffset: rows.length > 50 ? offset + 50 : null,
    };
  }
  async record(code: string, playerId: string) {
    // Completed games remain available as records after the invitation expires.
    const match = await this.store.get(code);
    if (
      !match ||
      match.environment !== this.environment ||
      !match.players.some((p) => p.id === playerId)
    )
      throw new MatchError('This record is not available.');
    const opponent = match.players.find((p) => p.id !== playerId);
    if (!opponent) throw new MatchError('Your friend has not joined this game yet.');
    const record = await this.store.record(playerId, opponent.id, this.environment);
    return {
      ...record,
      opponent: opponent.name,
      recent: record.recent.map((row) => summary(row, playerId)),
    };
  }
  async create(player: Player): Promise<Match> {
    for (let i = 0; i < 5; i++) {
      const match: Match = {
        environment: this.environment,
        code: Array.from({ length: 6 }, () => String.fromCharCode(65 + randomInt(26))).join(''),
        revision: 0,
        players: [player],
        game: { ...createGame('friends', randomInt(1, 4294967296)), mode: 'friends' },
        receipts: [],
        expiresAt: Date.now() + 7 * 86400000,
      };
      if (await this.store.insert(match)) return match;
    }
    throw new MatchError('Could not create a game. Please try again.');
  }
  async get(code: string): Promise<Match> {
    const match = await this.store.get(code);
    if (!match || match.environment !== this.environment || match.expiresAt <= Date.now())
      throw new MatchError('This game code has expired or does not exist.');
    return match;
  }
  async join(code: string, player: Player): Promise<Match> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const match = await this.get(code);
      if (match.players.some((p) => p.id === player.id)) return match;
      if (match.players.length === 2) throw new MatchError('This game already has two players.');
      const next = { ...match, players: [...match.players, player], revision: match.revision + 1 };
      if (await this.store.save(next, match.revision)) return next;
    }
    throw new MatchError('The game changed. Please join again.');
  }
  async act(code: string, playerId: string, input: unknown): Promise<Match> {
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) throw new MatchError('Invalid move request.');
    const command: Command = parsed.data;
    const match = await this.get(code);
    const seat = match.players.findIndex((p) => p.id === playerId);
    if (seat < 0) throw new MatchError('You are not a player in this game.');
    const digest = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const receipt = match.receipts.find((r) => r.id === command.id);
    if (receipt) {
      if (receipt.playerId !== playerId || receipt.digest !== digest)
        throw new MatchError('That request ID was already used.');
      return match;
    }
    if (match.players.length !== 2) throw new MatchError('Wait for your friend to join.');
    if (match.game.status !== 'playing') throw new MatchError('This game has finished.');
    if (match.revision !== command.revision)
      throw new MatchError('The board changed. Review the latest board and try again.');
    if (match.game.turn !== seat) throw new MatchError('It is your friend’s turn.');
    if (match.game.history.length >= 999)
      throw new MatchError('This match has reached its turn limit. Start a new game.');
    let game;
    try {
      const action = command.action;
      game =
        action.kind === 'play'
          ? playMove(match.game, action.placements, this.dictionary)
          : action.kind === 'pass'
            ? passTurn(match.game)
            : exchangeTiles(match.game, action.ids);
    } catch (error) {
      throw new MatchError(
        error instanceof Error ? error.message : 'This move could not be played.',
      );
    }
    const next: Match = {
      ...match,
      game: { ...game, mode: 'friends' },
      revision: match.revision + 1,
      receipts: [...match.receipts, { id: command.id, playerId, digest }],
    };
    if (!(await this.store.save(next, match.revision)))
      throw new MatchError('Another move arrived first. Review the board and try again.');
    return next;
  }
}
/** Explicit projection: never serialize the full game, seed, bag, or opponent's rack. */
export function snapshot(match: Match, playerId: string, online: ReadonlySet<string>): Snapshot {
  const seat = match.players.findIndex((p) => p.id === playerId);
  if (seat < 0) throw new MatchError('You are not a player in this game.');
  const other = 1 - seat;
  return {
    code: match.code,
    revision: match.revision,
    phase: match.players.length < 2 ? 'waiting' : match.game.status,
    board: match.game.board,
    rack: match.game.racks[seat],
    bagCount: match.game.bag.length,
    scores: [match.game.scores[seat], match.game.scores[other]],
    turn: match.game.turn === seat ? 0 : 1,
    history: match.game.history.map((h) => ({ ...h, player: h.player === seat ? 0 : 1 })),
    status: match.game.status,
    endReason: match.game.endReason,
    players: [match.players[seat], match.players[other]]
      .filter((p): p is Player => !!p)
      .map((p) => ({ name: p.name, online: online.has(p.id) })),
    expiresAt: match.expiresAt,
  };
}

function summary(row: Awaited<ReturnType<Store['list']>>[number], playerId: string): GameSummary {
  const seat = row.players.findIndex((p) => p.id === playerId);
  if (seat < 0) throw new MatchError('This game is not available.');
  return {
    code: row.code,
    opponent: row.players[1 - seat]?.name ?? null,
    scores: [row.scores[seat], row.scores[1 - seat]],
    phase: row.players.length < 2 ? 'waiting' : row.status,
    yourTurn: row.status === 'playing' && row.players.length === 2 && row.turn === seat,
    updatedAt: row.updatedAt.toISOString(),
  };
}
