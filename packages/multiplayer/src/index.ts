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
      kind: z.enum(['play', 'pass', 'exchange', 'resign']),
      words: z.array(z.string().max(15)).max(8),
      score: z.number().int(),
      placements: z.array(placementSchema).max(7),
    }),
  )
  .max(1000);
export const codeSchema = z.string().regex(/^[A-Z0-9]{6}$/);
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
      z.object({ kind: z.literal('resign') }).strict(),
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
  tilesLeft: z.number().int().min(0).max(60).nullable().default(null),
  opponentRackCount: z.number().int().min(0).max(7).default(0),
  scores: z.tuple([z.number().int(), z.number().int()]),
  turn: z.number().int().min(0).max(1),
  history: historySchema,
  status: z.enum(['playing', 'finished']),
  endReason: z.enum(['rack-empty', 'scoreless', 'resigned']).nullable(),
  resignedBy: z.number().int().min(0).max(1).optional(),
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
export const runtimeSchema = z.object({
  authMode: z.enum(['local', 'vatar', 'disabled']),
  platformMatches: z.boolean().default(false),
  diamondPurchases: z.boolean().default(false),
  themeProducts: z
    .array(z.object({ id: z.string(), name: z.string(), price: z.number().int() }))
    .default([]),
  themeProduct: z
    .object({ id: z.string(), name: z.string(), price: z.number().int() })
    .nullable()
    .default(null),
});

export const gameSummarySchema = z.object({
  code: codeSchema,
  opponent: z.string().nullable(),
  scores: z.tuple([z.number().int(), z.number().int()]),
  phase: z.enum(['waiting', 'playing', 'finished']),
  yourTurn: z.boolean(),
  expiresAt: z.number(),
  outcome: z.enum(['win', 'loss', 'draw']).nullable(),
  resigned: z.boolean(),
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

export const themeCatalog = [
  {
    id: 'classic',
    productId: null,
    name: 'Classic',
    price: 0,
    subtitle: 'The original word club',
    description: 'Fresh greens, familiar tiles. Always yours.',
  },
  {
    id: 'sunset',
    productId: 'sunset_board',
    name: 'Sunset',
    price: 500,
    subtitle: 'A softer kind of evening',
    description: 'Warm peach, dusty rose and a little golden-hour magic.',
  },
  {
    id: 'midnight',
    productId: 'midnight_board',
    name: 'Midnight',
    price: 500,
    subtitle: 'For your after-hours words',
    description: 'Deep navy, soft blue highlights and crisp cream letters.',
  },
  {
    id: 'ankara',
    productId: 'ankara_board',
    name: 'Ankara',
    price: 500,
    subtitle: 'Colour with a little rhythm',
    description: 'Woven patterns and joyful accents around a clear, calm board.',
  },
  {
    id: 'royal',
    productId: 'royal_board',
    name: 'Royal',
    price: 500,
    subtitle: 'Every word deserves a crown',
    description: 'Emerald, ivory and gold. A table fit for your best words.',
  },
] as const;
export type ThemeId = (typeof themeCatalog)[number]['id'];
export const themeIdSchema = z.enum(['classic', 'sunset', 'midnight', 'ankara', 'royal']);
export const themeOwnershipSchema = z.object({
  owned: z.boolean(),
  themes: z.array(themeIdSchema).default([]),
});
export const statsSchema = z.object({
  played: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  draws: z.number().int(),
  bestScore: z.number().int().nullable(),
  bestMove: z.number().int(),
  bestWords: z.array(z.string()),
  words: z.number().int(),
  bingos: z.number().int(),
  yourTurn: z.number().int(),
});
export type PlayerStats = z.infer<typeof statsSchema>;

export const HINT_COST = 10;
export const WELCOME_DIAMONDS = 10;
export const diamondPacks = [
  { id: 'diamonds_100', diamonds: 100, price: 500 },
  { id: 'diamonds_250', diamonds: 250, price: 1000 },
  { id: 'diamonds_700', diamonds: 700, price: 2500 },
] as const;
export const walletSchema = z.object({ balance: z.number().int(), demo: z.boolean() });
export const hintMoveSchema = z.object({
  placements: z.array(placementSchema).min(1).max(7),
  score: z.number().int().nonnegative(),
  words: z
    .array(z.string().regex(/^[A-Z]{2,15}$/))
    .min(1)
    .max(8),
});
export type HintMove = z.infer<typeof hintMoveSchema>;
export const hintRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('friend'),
      code: codeSchema,
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('computer'),
      board: boardSchema,
      rack: z.array(tileSchema).min(1).max(7),
    })
    .strict(),
]);
export type HintRequest = z.infer<typeof hintRequestSchema>;
export const hintReplySchema = z.object({
  move: hintMoveSchema.nullable(),
  balance: z.number().int(),
  charged: z.boolean(),
});
