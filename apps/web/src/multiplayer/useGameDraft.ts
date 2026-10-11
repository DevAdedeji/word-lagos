import { useEffect, useState, type SetStateAction } from 'react';
import { z } from 'zod';
import { placementSchema } from '@word-lagos/multiplayer';
import type { Placement } from '@word-lagos/game-core';

const key = 'wordpadi:drafts:v1';
const schema = z.record(
  z.string(),
  z.object({ revision: z.string(), tiles: z.array(placementSchema).max(7) }),
);
export type Drafts = z.infer<typeof schema>;
function loadDrafts(): Drafts {
  try {
    return schema.parse(JSON.parse(sessionStorage.getItem(key) ?? '{}'));
  } catch {
    return {};
  }
}
export function draftFor(drafts: Drafts, gameKey: string, revision: string | null): Placement[] {
  const saved = drafts[gameKey];
  return saved && saved.revision === revision ? saved.tiles : [];
}
export function useGameDraft(gameKey: string, revision: string | null) {
  const [drafts, setDrafts] = useState(loadDrafts);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(drafts));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, [drafts]);
  function setDraft(update: SetStateAction<Placement[]>) {
    if (revision === null) return;
    setDrafts((current) => {
      const tiles =
        typeof update === 'function' ? update(draftFor(current, gameKey, revision)) : update;
      const next = { ...current };
      delete next[gameKey];
      // Discard oldest inactive drafts if the player has accumulated many games.
      const entries = Object.entries(next).slice(-99);
      return { ...Object.fromEntries(entries), [gameKey]: { revision, tiles } };
    });
  }
  return { draft: draftFor(drafts, gameKey, revision), setDraft, saveFailed };
}
