import { SIZE, inside, evaluateMove, type Board, type Tile, type Placement } from './index';
type Trie = { children: Map<string, Trie>; word: boolean };
export type BotMove = { placements: Placement[]; score: number };
export function buildTrie(dictionary: ReadonlySet<string>): Trie {
  const root: Trie = { children: new Map(), word: false };
  for (const word of dictionary) {
    let node = root;
    for (const letter of word) {
      let child = node.children.get(letter);
      if (!child) {
        child = { children: new Map(), word: false };
        node.children.set(letter, child);
      }
      node = child;
    }
    node.word = true;
  }
  return root;
}
/** Searches legal board words. The caller runs this CPU work in a Web Worker. */
export function findBotMove(
  board: Board,
  rack: Tile[],
  dictionary: ReadonlySet<string>,
  trie = buildTrie(dictionary),
): BotMove | null {
  const opening = !board.some((row) => row.some(Boolean));
  const candidates: BotMove[] = [];
  const seen = new Set<string>();
  const isAnchor = (r: number, c: number): boolean =>
    !board[r][c] &&
    (opening
      ? r === 7 && c === 7
      : [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dr, dc]) => inside(r + dr, c + dc) && board[r + dr][c + dc]));
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
  ]) {
    const cross = new Map<string, Set<string>>();
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!board[r][c]) {
          let prefix = '',
            suffix = '',
            rr = r - dc,
            cc = c - dr;
          while (inside(rr, cc) && board[rr][cc]) {
            prefix = board[rr][cc]!.letter + prefix;
            rr -= dc;
            cc -= dr;
          }
          rr = r + dc;
          cc = c + dr;
          while (inside(rr, cc) && board[rr][cc]) {
            suffix += board[rr][cc]!.letter;
            rr += dc;
            cc += dr;
          }
          if (prefix || suffix)
            cross.set(
              `${r},${c}`,
              new Set(
                [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((l) =>
                  dictionary.has(prefix + l + suffix),
                ),
              ),
            );
        }
    for (let sr = 0; sr < SIZE; sr++)
      for (let sc = 0; sc < SIZE; sc++) {
        if (inside(sr - dr, sc - dc) && board[sr - dr][sc - dc]) continue;
        // Every generated word must be able to reach an anchor using this rack.
        let reachable = false,
          empties = 0;
        for (let r = sr, c = sc; inside(r, c); r += dr, c += dc) {
          if (!board[r][c]) empties++;
          if (empties > rack.length) break;
          if (isAnchor(r, c)) {
            reachable = true;
            break;
          }
        }
        if (!reachable) continue;
        const walk = (
          r: number,
          c: number,
          node: Trie,
          remaining: Tile[],
          placed: Placement[],
          anchored: boolean,
          length: number,
        ): void => {
          if (
            node.word &&
            length > 1 &&
            placed.length &&
            anchored &&
            (!inside(r, c) || !board[r][c])
          ) {
            const key = placed.map((p) => `${p.row},${p.col},${p.letter}`).join(';');
            if (!seen.has(key)) {
              seen.add(key);
              const result = evaluateMove(board, rack, placed, dictionary);
              if (result.ok) candidates.push({ placements: placed, score: result.score });
            }
          }
          if (!inside(r, c)) return;
          const existing = board[r][c];
          if (existing) {
            const child = node.children.get(existing.letter);
            if (child) walk(r + dr, c + dc, child, remaining, placed, anchored, length + 1);
            return;
          }
          if (!remaining.length) return;
          const used = new Set<string>(),
            allowed = cross.get(`${r},${c}`);
          for (let i = 0; i < remaining.length; i++) {
            const tile = remaining[i];
            if (used.has(tile.letter)) continue;
            used.add(tile.letter);
            const letters = tile.letter === '?' ? [...node.children.keys()] : [tile.letter];
            for (const letter of letters) {
              const child = node.children.get(letter);
              if (!child || (allowed && !allowed.has(letter))) continue;
              walk(
                r + dr,
                c + dc,
                child,
                remaining.filter((_, j) => j !== i),
                [...placed, { tileId: tile.id, row: r, col: c, letter }],
                anchored || isAnchor(r, c),
                length + 1,
              );
            }
          }
        };
        walk(sr, sc, trie, rack, [], false, 0);
      }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.score - b.score);
  // A friendly opponent chooses a solid move, rather than the highest scoring one.
  return candidates[Math.floor((candidates.length - 1) * 0.65)];
}
