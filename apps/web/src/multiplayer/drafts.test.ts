import { describe, expect, it } from 'vitest';
import { draftFor, type Drafts } from './useGameDraft';

describe('drafts when switching games', () => {
  const tiles = [{ tileId: 'A1', row: 7, col: 7, letter: 'A' }];
  const drafts: Drafts = {
    ABCDEF: { revision: '4', tiles },
    computer: { revision: '123:0:playing', tiles },
  };
  it('keeps each board’s unsubmitted tiles separate', () => {
    expect(draftFor(drafts, 'ABCDEF', '4')).toEqual(tiles);
    expect(draftFor(drafts, 'GHIJKL', '4')).toEqual([]);
    expect(draftFor(drafts, 'computer', '123:0:playing')).toEqual(tiles);
  });
  it('does not restore a stale draft over a newer board or while reconnecting', () => {
    expect(draftFor(drafts, 'ABCDEF', '5')).toEqual([]);
    expect(draftFor(drafts, 'ABCDEF', null)).toEqual([]);
    expect(draftFor(drafts, 'ABCDEF', '4')).toEqual(tiles);
  });
});
