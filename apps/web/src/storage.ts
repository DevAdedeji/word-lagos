import { z } from 'zod';
import { DICTIONARY_VERSION, type Game } from '@word-lagos/game-core';
const tile = z.object({ id: z.string().max(8), letter: z.string().regex(/^[A-Z?]$/) });
const placement = z.object({
  tileId: z.string().max(8),
  row: z.number().int().min(0).max(14),
  col: z.number().int().min(0).max(14),
  letter: z.string().regex(/^[A-Z]$/),
});
const schema = z
  .object({
    version: z.literal(1),
    dictionary: z.literal(DICTIONARY_VERSION),
    mode: z.literal('computer'),
    board: z
      .array(
        z
          .array(
            tile.extend({ letter: z.string().regex(/^[A-Z]$/), blank: z.boolean() }).nullable(),
          )
          .length(15),
      )
      .length(15),
    bag: z.array(tile).max(120),
    tileSupply: z.literal('personal-60').optional(),
    racks: z.array(z.array(tile).max(7)).min(1).max(2),
    scores: z.array(z.number().int()).min(1).max(2),
    turn: z.number().int().min(0).max(1),
    history: z
      .array(
        z.object({
          player: z.number().int().min(0).max(1),
          kind: z.enum(['play', 'pass', 'exchange', 'resign']),
          words: z.array(z.string().max(15)).max(8),
          score: z.number().int().min(0),
          placements: z.array(placement).max(7),
        }),
      )
      .max(1000),
    scoreless: z.number().int().min(0).max(6),
    rng: z.number().int().min(0).max(4294967295),
    status: z.enum(['playing', 'finished']),
    endReason: z.enum(['rack-empty', 'scoreless', 'resigned']).nullable(),
    resignedBy: z.number().int().min(0).max(1).optional(),
  })
  .refine(
    (g) => g.racks.length === 2 && g.scores.length === g.racks.length && g.turn < g.racks.length,
  )
  .refine((g) => {
    const all = [...g.bag, ...g.racks.flat(), ...g.board.flat().filter((t) => t !== null)];
    const count = g.tileSupply === 'personal-60' ? 120 : 100;
    if (all.length !== count || new Set(all.map((t) => t.id)).size !== count) return false;
    if (g.tileSupply === 'personal-60')
      return [0, 1].every(
        (seat) =>
          all.filter((t) => t.id.startsWith(`${seat}:`)).length === 60 &&
          g.racks[seat].every((t) => t.id.startsWith(`${seat}:`)),
      );
    return true;
  });
const KEY = 'word-lagos:game:v1';
export function loadGame(): Game | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = schema.safeParse(JSON.parse(raw));
    return value.success ? value.data : null;
  } catch {
    return null;
  }
}
export function saveGame(game: Game): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(game));
    return true;
  } catch {
    return false;
  }
}
