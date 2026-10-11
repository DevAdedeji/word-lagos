import { z } from 'zod';

export const tileSchema = z.object({ id: z.string().max(8), letter: z.string().regex(/^[A-Z?]$/) });
export const placementSchema = z.object({
  tileId: z.string().max(8),
  row: z.number().int().min(0).max(14),
  col: z.number().int().min(0).max(14),
  letter: z.string().regex(/^[A-Z]$/),
});
export const boardSchema = z
  .array(z.array(tileSchema.extend({ blank: z.boolean() }).nullable()).length(15))
  .length(15);
export const historySchema = z
  .array(
    z.object({
      player: z.number().int().min(0).max(1),
      kind: z.enum(['play', 'pass', 'exchange']),
      words: z.array(z.string().max(15)).max(8),
      score: z.number().int(),
      placements: z.array(placementSchema).max(7),
    }),
  )
  .max(1000);
export const codeSchema = z.string().regex(/^[A-Z]{6}$/);
export const commandSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    action: z.discriminatedUnion('kind', [
      z
        .object({ kind: z.literal('play'), placements: z.array(placementSchema).min(1).max(7) })
        .strict(),
      z
        .object({ kind: z.literal('exchange'), ids: z.array(z.string().max(8)).min(1).max(7) })
        .strict(),
      z.object({ kind: z.literal('pass') }).strict(),
    ]),
  })
  .strict();
export type Command = z.infer<typeof commandSchema>;
export type Action = Command['action'];
export const snapshotSchema = z.object({
  code: codeSchema,
  revision: z.number().int().nonnegative(),
  phase: z.enum(['waiting', 'playing', 'finished']),
  board: boardSchema,
  rack: z.array(tileSchema).max(7),
  bagCount: z.number().int().min(0).max(100),
  scores: z.tuple([z.number().int(), z.number().int()]),
  turn: z.number().int().min(0).max(1),
  history: historySchema,
  status: z.enum(['playing', 'finished']),
  endReason: z.enum(['rack-empty', 'scoreless']).nullable(),
  players: z
    .array(z.object({ name: z.string().max(80), online: z.boolean() }))
    .min(1)
    .max(2),
  expiresAt: z.number(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const replySchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export const runtimeSchema = z.object({ authMode: z.enum(['local', 'vatar', 'disabled']) });

export const gameSummarySchema = z.object({
  code: codeSchema,
  opponent: z.string().nullable(),
  scores: z.tuple([z.number().int(), z.number().int()]),
  phase: z.enum(['waiting', 'playing', 'finished']),
  yourTurn: z.boolean(),
  updatedAt: z.string(),
});
export type GameSummary = z.infer<typeof gameSummarySchema>;
export const gameListSchema = z.object({
  games: z.array(gameSummarySchema).max(50),
  nextOffset: z.number().int().nonnegative().nullable(),
});
export const recordSchema = z.object({
  opponent: z.string(),
  played: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  recent: z.array(gameSummarySchema).max(20),
});
export type PlayerRecord = z.infer<typeof recordSchema>;
