import type { Match } from './store';
import { sql } from 'drizzle-orm';
import type { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import type { drizzle as liteDrizzle } from 'drizzle-orm/pglite';
import { z } from 'zod';
import {
  HINT_COST,
  WELCOME_DIAMONDS,
  hintMoveSchema,
  type HintMove,
} from '@word-lagos/multiplayer';
import type { Purchase } from './vatar';
export class DiamondError extends Error {}
type Database = ReturnType<typeof pgDrizzle> | ReturnType<typeof liteDrizzle>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Environment = 'local' | 'test' | 'live';
const balanceRow = z.object({ balance: z.number().int() });
async function lockWallet(tx: Transaction, player: string, env: Environment) {
  await tx.execute(
    sql`INSERT INTO diamond_wallets(environment, player_id, balance) VALUES (${env}, ${player}, ${WELCOME_DIAMONDS}) ON CONFLICT DO NOTHING`,
  );
  await tx.execute(
    sql`INSERT INTO diamond_entries(environment, player_id, entry_key, delta, kind) VALUES (${env}, ${player}, 'welcome', ${WELCOME_DIAMONDS}, 'welcome') ON CONFLICT DO NOTHING`,
  );
  const result = await tx.execute(
    sql`SELECT balance FROM diamond_wallets WHERE environment=${env} AND player_id=${player} FOR UPDATE`,
  );
  return balanceRow.parse(result.rows[0]).balance;
}
export async function migrateDiamonds(db: Database) {
  await db.transaction(async (tx) => {
    const applied = await tx.execute(
      sql`INSERT INTO schema_migrations(version) VALUES (3) ON CONFLICT DO NOTHING RETURNING version`,
    );
    if (!applied.rows.length) return;
    await tx.execute(
      sql`CREATE TABLE diamond_wallets (environment text NOT NULL CHECK(environment IN ('local','test','live')), player_id text NOT NULL, balance integer NOT NULL, PRIMARY KEY(environment, player_id))`,
    );
    await tx.execute(
      sql`CREATE TABLE diamond_entries (environment text NOT NULL, player_id text NOT NULL, entry_key text NOT NULL, delta integer NOT NULL, kind text NOT NULL CHECK(kind IN ('welcome','purchase','refund','hint','demo')), receipt jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(environment, player_id, entry_key), FOREIGN KEY(environment,player_id) REFERENCES diamond_wallets(environment,player_id))`,
    );
    await tx.execute(
      sql`ALTER TABLE vatar_purchases ADD COLUMN checked_at timestamptz NOT NULL DEFAULT now()`,
    );
  });
}
export function diamondStore(db: Database) {
  return {
    async initialize(player: string, env: Environment) {
      return db.transaction((tx) => lockWallet(tx, player, env));
    },
    async balance(player: string, env: Environment) {
      const result = await db.execute(
        sql`SELECT balance FROM diamond_wallets WHERE environment=${env} AND player_id=${player}`,
      );
      return result.rows.length ? balanceRow.parse(result.rows[0]).balance : 0;
    },
    async grant(p: Purchase, diamonds: number) {
      await db.transaction(async (tx) => {
        await lockWallet(tx, p.playerId, p.mode);
        await tx.execute(
          sql`INSERT INTO vatar_purchases(id,environment,player_id,product_id,amount,currency,status) VALUES (${p.id},${p.mode},${p.playerId},${p.productId},${p.amount},${p.currency},'pending') ON CONFLICT DO NOTHING`,
        );
        const result = await tx.execute(
          sql`SELECT status, player_id, product_id FROM vatar_purchases WHERE id=${p.id} AND environment=${p.mode} FOR UPDATE`,
        );
        const row = z
          .object({ status: z.string(), player_id: z.string(), product_id: z.string() })
          .parse(result.rows[0]);
        if (
          row.status === 'refunded' ||
          row.player_id !== p.playerId ||
          row.product_id !== p.productId
        )
          throw new DiamondError('This purchase cannot be credited.');
        const entry = await tx.execute(
          sql`INSERT INTO diamond_entries(environment,player_id,entry_key,delta,kind) VALUES (${p.mode},${p.playerId},${'purchase:' + p.id},${diamonds},'purchase') ON CONFLICT DO NOTHING RETURNING delta`,
        );
        if (entry.rows.length)
          await tx.execute(
            sql`UPDATE diamond_wallets SET balance=balance+${diamonds} WHERE environment=${p.mode} AND player_id=${p.playerId}`,
          );
        await tx.execute(
          sql`UPDATE vatar_purchases SET checked_at=now() WHERE id=${p.id} AND environment=${p.mode}`,
        );
      });
    },
    async refund(id: string, env: Environment) {
      // Lock the wallet before the purchase, matching the credit lock order.
      const owner = await db.execute(
        sql`SELECT player_id FROM vatar_purchases WHERE id=${id} AND environment=${env}`,
      );
      if (!owner.rows.length) return;
      const player = z.object({ player_id: z.string() }).parse(owner.rows[0]).player_id;
      await db.transaction(async (tx) => {
        await lockWallet(tx, player, env);
        await tx.execute(
          sql`UPDATE vatar_purchases SET status='refunded',updated_at=now(),checked_at=now() WHERE id=${id} AND environment=${env}`,
        );
        const credit = await tx.execute(
          sql`SELECT delta FROM diamond_entries WHERE environment=${env} AND player_id=${player} AND entry_key=${'purchase:' + id}`,
        );
        if (!credit.rows.length) return;
        const amount = z.object({ delta: z.number().int() }).parse(credit.rows[0]).delta;
        const reversal = await tx.execute(
          sql`INSERT INTO diamond_entries(environment,player_id,entry_key,delta,kind) VALUES (${env},${player},${'refund:' + id},${-amount},'refund') ON CONFLICT DO NOTHING RETURNING delta`,
        );
        if (reversal.rows.length)
          await tx.execute(
            sql`UPDATE diamond_wallets SET balance=balance-${amount} WHERE environment=${env} AND player_id=${player}`,
          );
      });
    },
    async cached(player: string, env: Environment, key: string) {
      const row = await db.execute(
        sql`SELECT receipt FROM diamond_entries WHERE environment=${env} AND player_id=${player} AND entry_key=${'hint:' + key}`,
      );
      return row.rows.length ? hintMoveSchema.parse(row.rows[0].receipt) : null;
    },
    async spend(
      player: string,
      env: Environment,
      key: string,
      move: HintMove,
      match?: { code: string; revision: number; next: Match },
    ) {
      return db.transaction(async (tx) => {
        const balance = await lockWallet(tx, player, env);
        const previous = await tx.execute(
          sql`SELECT receipt FROM diamond_entries WHERE environment=${env} AND player_id=${player} AND entry_key=${'hint:' + key}`,
        );
        if (previous.rows.length)
          return { move: hintMoveSchema.parse(previous.rows[0].receipt), balance, charged: false };
        if (match) {
          const current = await tx.execute(
            sql`SELECT revision FROM friend_matches WHERE code=${match.code} AND revision=${match.revision} AND coalesce(data->>'environment','local')=${env} AND data->'game'->>'status'='playing' AND (data->>'expiresAt')::numeric > extract(epoch from now())*1000 AND data->'players'->((data->'game'->>'turn')::int)->>'id'=${player} FOR UPDATE`,
          );
          if (!current.rows.length)
            throw new DiamondError(
              'The game changed. No diamonds were spent. Try again on your turn.',
            );
        }
        if (balance < HINT_COST) throw new DiamondError('You need 10 diamonds to play a word.');
        await tx.execute(
          sql`INSERT INTO diamond_entries(environment,player_id,entry_key,delta,kind,receipt) VALUES (${env},${player},${'hint:' + key},${-HINT_COST},'hint',${JSON.stringify(move)}::jsonb)`,
        );
        await tx.execute(
          sql`UPDATE diamond_wallets SET balance=balance-${HINT_COST} WHERE environment=${env} AND player_id=${player}`,
        );
        if (match)
          await tx.execute(
            sql`UPDATE friend_matches SET data=${JSON.stringify(match.next)}::jsonb, revision=${match.next.revision}, updated_at=now() WHERE code=${match.code}`,
          );
        return { move, balance: balance - HINT_COST, charged: true };
      });
    },
    async demoCredit(player: string, key: string, diamonds: number) {
      return db.transaction(async (tx) => {
        const balance = await lockWallet(tx, player, 'local');
        const entry = await tx.execute(
          sql`INSERT INTO diamond_entries(environment,player_id,entry_key,delta,kind) VALUES ('local',${player},${'demo:' + key},${diamonds},'demo') ON CONFLICT DO NOTHING RETURNING delta`,
        );
        if (!entry.rows.length) return balance;
        await tx.execute(
          sql`UPDATE diamond_wallets SET balance=balance+${diamonds} WHERE environment='local' AND player_id=${player}`,
        );
        return balance + diamonds;
      });
    },
    async reviewPurchases(env: Environment) {
      const rows = await db.execute(
        sql`SELECT id,player_id FROM vatar_purchases WHERE environment=${env} AND product_id IN ('diamonds_100','diamonds_250','diamonds_700') AND status <> 'refunded' AND checked_at < now()-interval '60 seconds' ORDER BY checked_at LIMIT 10`,
      );
      const purchases = z
        .array(z.object({ id: z.string(), player_id: z.string() }))
        .parse(rows.rows);
      for (const purchase of purchases)
        await db.execute(
          sql`UPDATE vatar_purchases SET checked_at=now() WHERE id=${purchase.id} AND environment=${env}`,
        );
      return purchases;
    },
  };
}
