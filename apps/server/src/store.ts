import { PGlite } from '@electric-sql/pglite';
import { drizzle as liteDrizzle } from 'drizzle-orm/pglite';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { and, eq, sql, desc } from 'drizzle-orm';
import pg from 'pg';
import { z } from 'zod';
import { boardSchema, historySchema, tileSchema, codeSchema } from '@word-lagos/multiplayer';

export const playerSchema = z.object({
  id: z.string().min(1).max(160),
  name: z.string().min(1).max(80),
});
export type Player = z.infer<typeof playerSchema>;
export const matchSchema = z.object({
  code: codeSchema,
  environment: z.enum(['local', 'test', 'live']).default('local'),
  revision: z.number().int().nonnegative(),
  players: z.array(playerSchema).min(1).max(2),
  game: z.object({
    version: z.literal(1),
    dictionary: z.literal('word-list-4.1.0'),
    mode: z.literal('friends'),
    board: boardSchema,
    bag: z.array(tileSchema).max(100),
    racks: z.array(z.array(tileSchema).max(7)).length(2),
    scores: z.array(z.number().int()).length(2),
    turn: z.number().int().min(0).max(1),
    history: historySchema,
    scoreless: z.number().int().min(0).max(6),
    rng: z.number().int().nonnegative(),
    status: z.enum(['playing', 'finished']),
    endReason: z.enum(['rack-empty', 'scoreless']).nullable(),
  }),
  receipts: z
    .array(z.object({ id: z.string(), playerId: z.string(), digest: z.string() }))
    .max(1000),
  expiresAt: z.number(),
});
export type Match = z.infer<typeof matchSchema>;
const matches = pgTable('friend_matches', {
  code: text('code').primaryKey(),
  revision: integer('revision').notNull(),
  data: jsonb('data').$type<Match>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
const sessions = pgTable('local_sessions', {
  hash: text('hash').primaryKey(),
  player: jsonb('player').$type<Player>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export async function openStore(databaseUrl?: string, localPath?: string) {
  const client = databaseUrl
    ? new pg.Pool({
        connectionString: databaseUrl,
        max: 5,
        connectionTimeoutMillis: 30000,
        idleTimeoutMillis: 20000,
        statement_timeout: 15000,
      })
    : new PGlite(localPath);
  const db = client instanceof pg.Pool ? pgDrizzle(client) : liteDrizzle(client);
  // Initial, additive schema. Future changes require a numbered migration.
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS friend_matches (code text PRIMARY KEY CHECK (code ~ '^[A-Z]{6}$'), revision integer NOT NULL CHECK (revision >= 0), data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
  );
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS local_sessions (hash text PRIMARY KEY, player jsonb NOT NULL, expires_at timestamptz NOT NULL)`,
  );
  const owned = (playerId: string, environment: string) =>
    and(
      sql`${matches.data}->'players' @> ${JSON.stringify([{ id: playerId }])}::jsonb`,
      sql`coalesce(${matches.data}->>'environment', 'local') = ${environment}`,
    );
  const finished = sql`${matches.data}->'game'->>'status' = 'finished'`;
  const summaryColumns = {
    code: matches.code,
    players: sql<Player[]>`${matches.data}->'players'`,
    scores: sql<number[]>`${matches.data}->'game'->'scores'`,
    turn: sql<number>`(${matches.data}->'game'->>'turn')::int`,
    status: sql<'playing' | 'finished'>`${matches.data}->'game'->>'status'`,
    updatedAt: matches.updatedAt,
  };
  return {
    async list(playerId: string, environment: string, completed: boolean, offset: number) {
      return db
        .select(summaryColumns)
        .from(matches)
        .where(
          and(
            owned(playerId, environment),
            completed
              ? finished
              : and(
                  sql`${matches.data}->'game'->>'status' = 'playing'`,
                  sql`(${matches.data}->>'expiresAt')::numeric > extract(epoch from now()) * 1000`,
                ),
          ),
        )
        .orderBy(desc(matches.updatedAt), desc(matches.code))
        .limit(51)
        .offset(offset);
    },
    async record(playerId: string, opponentId: string, environment: string) {
      const pair = and(
        owned(playerId, environment),
        sql`${matches.data}->'players' @> ${JSON.stringify([{ id: opponentId }])}::jsonb`,
        finished,
      );
      const scoreDifference = sql`CASE WHEN ${matches.data}->'players'->0->>'id' = ${playerId}
        THEN (${matches.data}->'game'->'scores'->>0)::int - (${matches.data}->'game'->'scores'->>1)::int
        ELSE (${matches.data}->'game'->'scores'->>1)::int - (${matches.data}->'game'->'scores'->>0)::int END`;
      const [counts] = await db
        .select({
          played: sql<number>`count(*)::int`,
          wins: sql<number>`count(*) filter (where (${scoreDifference}) > 0)::int`,
          losses: sql<number>`count(*) filter (where (${scoreDifference}) < 0)::int`,
          draws: sql<number>`count(*) filter (where (${scoreDifference}) = 0)::int`,
        })
        .from(matches)
        .where(pair);
      const recent = await db
        .select(summaryColumns)
        .from(matches)
        .where(pair)
        .orderBy(desc(matches.updatedAt), desc(matches.code))
        .limit(20);
      return { ...counts, recent };
    },
    async get(code: string): Promise<Match | null> {
      const [row] = await db.select().from(matches).where(eq(matches.code, code));
      return row ? matchSchema.parse(row.data) : null;
    },
    async insert(match: Match): Promise<boolean> {
      return (
        (
          await db
            .insert(matches)
            .values({ code: match.code, revision: match.revision, data: match })
            .onConflictDoNothing()
            .returning()
        ).length === 1
      );
    },
    async save(match: Match, previousRevision: number): Promise<boolean> {
      return (
        (
          await db
            .update(matches)
            .set({ data: match, revision: match.revision, updatedAt: sql`now()` })
            .where(and(eq(matches.code, match.code), eq(matches.revision, previousRevision)))
            .returning()
        ).length === 1
      );
    },
    async session(hash: string): Promise<Player | null> {
      const [row] = await db.select().from(sessions).where(eq(sessions.hash, hash));
      return row && row.expiresAt.getTime() > Date.now() ? playerSchema.parse(row.player) : null;
    },
    async addSession(hash: string, player: Player): Promise<void> {
      await db
        .insert(sessions)
        .values({ hash, player, expiresAt: new Date(Date.now() + 7 * 86400000) });
    },
    async healthy(): Promise<void> {
      await db.execute(sql`SELECT 1`);
    },
    async close(): Promise<void> {
      if (client instanceof pg.Pool) await client.end();
      else await client.close();
    },
  };
}
export type Store = Awaited<ReturnType<typeof openStore>>;
