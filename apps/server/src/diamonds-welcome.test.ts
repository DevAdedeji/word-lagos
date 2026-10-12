import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { diamondStore, migrateDiamonds } from './diamonds-store';

const client = new PGlite();
const db = drizzle(client);
const diamonds = diamondStore(db);
beforeAll(async () => {
  await db.execute(sql`CREATE TABLE schema_migrations(version integer PRIMARY KEY)`);
  await db.execute(sql`CREATE TABLE vatar_purchases(id text PRIMARY KEY)`);
  await migrateDiamonds(db);
}, 30000);
afterAll(() => client.close());

it('adds the missing welcome diamonds once while preserving purchases, spending and refund debt', async () => {
  for (const originalBalance of [0, 10, 90, -40]) {
    const player = `legacy-${originalBalance}`;
    for (const env of ['test', 'live'] as const) {
      await db.execute(
        sql`INSERT INTO diamond_wallets(environment,player_id,balance) VALUES (${env},${player},${originalBalance})`,
      );
      await db.execute(
        sql`INSERT INTO diamond_entries(environment,player_id,entry_key,delta,kind) VALUES
          (${env},${player},'welcome',10,'welcome'),
          (${env},${player},'purchase:old',100,'purchase'),
          (${env},${player},'hint:old',${originalBalance - 110},'hint')`,
      );
      expect(
        await Promise.all(Array.from({ length: 4 }, () => diamonds.initialize(player, env))),
      ).toEqual(Array(4).fill(originalBalance + 10));
      // A new store instance (e.g. after restart) must not award it again.
      expect(await diamondStore(db).initialize(player, env)).toBe(originalBalance + 10);
      const ledger = await db.execute(
        sql`SELECT entry_key,delta FROM diamond_entries WHERE environment=${env} AND player_id=${player} ORDER BY entry_key`,
      );
      expect(ledger.rows).toEqual([
        { entry_key: 'hint:old', delta: originalBalance - 110 },
        { entry_key: 'purchase:old', delta: 100 },
        { entry_key: 'welcome', delta: 10 },
        { entry_key: 'welcome-upgrade-20', delta: 10 },
      ]);
    }
  }
});

it('gives new accounts 20 total without also applying the legacy top-up', async () => {
  expect(await diamonds.initialize('new-player', 'live')).toBe(20);
  expect(await diamonds.initialize('new-player', 'live')).toBe(20);
  const entries = await db.execute(
    sql`SELECT entry_key,delta FROM diamond_entries WHERE environment='live' AND player_id='new-player'`,
  );
  expect(entries.rows).toEqual([{ entry_key: 'welcome', delta: 20 }]);
  expect(await diamonds.balance('new-player', 'test')).toBe(0);
});
