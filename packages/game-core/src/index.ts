export const SIZE = 15;
export const RACK_SIZE = 7;
export const DICTIONARY_VERSION = 'word-list-4.1.0';
export type Mode = 'computer' | 'friends';
export type Tile = { id: string; letter: string };
export type BoardTile = Tile & { blank: boolean };
export type Board = (BoardTile | null)[][];
export type Placement = { tileId: string; row: number; col: number; letter: string };
export type Premium = 'TW' | 'DW' | 'TL' | 'DL' | '';
export type WordScore = {
  word: string;
  score: number;
  valid: boolean;
  cells: { row: number; col: number }[];
};
export type MoveResult =
  | { ok: true; board: Board; words: WordScore[]; score: number; bingo: boolean }
  | { ok: false; error: string; words?: WordScore[] };
export type HistoryEntry = {
  player: number;
  kind: 'play' | 'pass' | 'exchange' | 'resign';
  words: string[];
  score: number;
  placements: Placement[];
};
export type Game = {
  version: 1;
  dictionary: typeof DICTIONARY_VERSION;
  mode: Mode;
  board: Board;
  bag: Tile[];
  tileSupply?: 'personal-60';
  racks: Tile[][];
  scores: number[];
  turn: number;
  history: HistoryEntry[];
  scoreless: number;
  rng: number;
  status: 'playing' | 'finished';
  endReason: 'rack-empty' | 'scoreless' | 'resigned' | null;
  resignedBy?: number;
};
const DISTRIBUTION: Record<string, [number, number]> = {
  A: [9, 1],
  B: [2, 3],
  C: [2, 3],
  D: [4, 2],
  E: [12, 1],
  F: [2, 4],
  G: [3, 2],
  H: [2, 4],
  I: [9, 1],
  J: [1, 8],
  K: [1, 5],
  L: [4, 1],
  M: [2, 3],
  N: [6, 1],
  O: [8, 1],
  P: [2, 3],
  Q: [1, 10],
  R: [6, 1],
  S: [4, 1],
  T: [6, 1],
  U: [4, 1],
  V: [2, 4],
  W: [2, 4],
  X: [1, 8],
  Y: [2, 4],
  Z: [1, 10],
  '?': [2, 0],
};
export const PERSONAL_DISTRIBUTION: Readonly<Record<string, number>> = {
  A: 6,
  E: 8,
  I: 6,
  O: 5,
  U: 3,
  B: 1,
  C: 1,
  D: 2,
  F: 1,
  G: 1,
  H: 1,
  J: 1,
  K: 1,
  L: 2,
  M: 1,
  N: 3,
  P: 1,
  Q: 1,
  R: 3,
  S: 2,
  T: 3,
  V: 1,
  W: 1,
  X: 1,
  Y: 1,
  Z: 1,
  '?': 2,
};
export function availableBag(game: Pick<Game, 'bag' | 'tileSupply'>, player: number): Tile[] {
  return game.tileSupply === 'personal-60'
    ? game.bag.filter((tile) => tile.id.startsWith(`${player}:`))
    : game.bag;
}
export function tilesRemaining(game: Game, player: number): number | null {
  return game.tileSupply === 'personal-60'
    ? availableBag(game, player).length + game.racks[player].length
    : null;
}
function draw(bag: Tile[], count: number, player: number, personal: boolean): Tile[] {
  const drawn: Tile[] = [];
  for (let i = 0; i < bag.length && drawn.length < count;) {
    if (!personal || bag[i].id.startsWith(`${player}:`)) drawn.push(...bag.splice(i, 1));
    else i++;
  }
  return drawn;
}
export const tileValue = (letter: string): number => DISTRIBUTION[letter]?.[1] ?? 0;
export const emptyBoard = (): Board =>
  Array.from({ length: SIZE }, () => Array<BoardTile | null>(SIZE).fill(null));
const premiums = new Map<string, Premium>();
const setPremium = (kind: Premium, coords: number[][]): void => {
  for (const [r, c] of coords) premiums.set(`${r},${c}`, kind);
};
setPremium('TW', [
  [0, 0],
  [0, 7],
  [0, 14],
  [7, 0],
  [7, 14],
  [14, 0],
  [14, 7],
  [14, 14],
]);
setPremium('DW', [
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [1, 13],
  [2, 12],
  [3, 11],
  [4, 10],
  [7, 7],
  [10, 4],
  [11, 3],
  [12, 2],
  [13, 1],
  [10, 10],
  [11, 11],
  [12, 12],
  [13, 13],
]);
setPremium('TL', [
  [1, 5],
  [1, 9],
  [5, 1],
  [5, 5],
  [5, 9],
  [5, 13],
  [9, 1],
  [9, 5],
  [9, 9],
  [9, 13],
  [13, 5],
  [13, 9],
]);
setPremium('DL', [
  [0, 3],
  [0, 11],
  [2, 6],
  [2, 8],
  [3, 0],
  [3, 7],
  [3, 14],
  [6, 2],
  [6, 6],
  [6, 8],
  [6, 12],
  [7, 3],
  [7, 11],
  [8, 2],
  [8, 6],
  [8, 8],
  [8, 12],
  [11, 0],
  [11, 7],
  [11, 14],
  [12, 6],
  [12, 8],
  [14, 3],
  [14, 11],
]);
export const premiumAt = (r: number, c: number): Premium => premiums.get(`${r},${c}`) ?? '';
export const inside = (r: number, c: number): boolean => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const at = (board: Board, r: number, c: number): BoardTile | null =>
  inside(r, c) ? board[r][c] : null;
export function makeLexicon(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter((w) => /^[A-Z]{2,15}$/.test(w)),
  );
}
export function evaluateMove(
  board: Board,
  rack: Tile[],
  placements: Placement[],
  dictionary: ReadonlySet<string>,
): MoveResult {
  const fail = (error: string): MoveResult => ({ ok: false, error });
  if (!placements.length) return fail('Place a word on the board first.');
  if (placements.length > RACK_SIZE) return fail('You can play up to seven tiles.');
  const used = new Set<string>(),
    cells = new Set<string>();
  const next = board.map((row) => row.slice());
  for (const p of placements) {
    if (!Number.isInteger(p.row) || !Number.isInteger(p.col) || !inside(p.row, p.col))
      return fail('Keep your tiles inside the board.');
    const tile = rack.find((t) => t.id === p.tileId);
    if (!tile || used.has(p.tileId)) return fail('Use each tile in your rack only once.');
    const key = `${p.row},${p.col}`;
    if (next[p.row][p.col] || cells.has(key)) return fail('That square is already occupied.');
    if (!/^[A-Z]$/.test(p.letter) || (tile.letter !== '?' && tile.letter !== p.letter))
      return fail('That letter does not match your tile.');
    used.add(p.tileId);
    cells.add(key);
    next[p.row][p.col] = { id: tile.id, letter: p.letter, blank: tile.letter === '?' };
  }
  const horizontal = placements.every((p) => p.row === placements[0].row);
  const vertical = placements.every((p) => p.col === placements[0].col);
  if (!horizontal && !vertical) return fail('Place your tiles in one row or one column.');
  const dr = horizontal ? 0 : 1,
    dc = horizontal ? 1 : 0;
  const sorted = [...placements].sort((a, b) => (horizontal ? a.col - b.col : a.row - b.row));
  const first = sorted[0],
    last = sorted[sorted.length - 1];
  for (let r = first.row, c = first.col; r <= last.row && c <= last.col; r += dr, c += dc)
    if (!next[r][c]) return fail('Close the gaps between your tiles.');
  const opening = !board.some((row) => row.some(Boolean));
  if (opening && !cells.has('7,7')) return fail('Your first word must cover the centre star.');
  if (
    !opening &&
    !placements.some((p) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([r, c]) => at(board, p.row + r, p.col + c)),
    )
  )
    return fail('Connect your word to a tile already on the board.');
  const words: WordScore[] = [];
  const seen = new Set<string>();
  for (const p of placements)
    for (const [rd, cd] of [
      [0, 1],
      [1, 0],
    ]) {
      let r = p.row,
        c = p.col;
      while (at(next, r - rd, c - cd)) {
        r -= rd;
        c -= cd;
      }
      const key = `${r},${c},${rd},${cd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const wordCells: { row: number; col: number }[] = [];
      let word = '',
        sum = 0,
        mult = 1;
      while (at(next, r, c)) {
        const tile = next[r][c]!;
        word += tile.letter;
        let value = tile.blank ? 0 : tileValue(tile.letter);
        if (cells.has(`${r},${c}`)) {
          const premium = premiumAt(r, c);
          if (premium === 'DL') value *= 2;
          if (premium === 'TL') value *= 3;
          if (premium === 'DW') mult *= 2;
          if (premium === 'TW') mult *= 3;
        }
        wordCells.push({ row: r, col: c });
        sum += value;
        r += rd;
        c += cd;
      }
      if (word.length > 1)
        words.push({ word, score: sum * mult, valid: dictionary.has(word), cells: wordCells });
    }
  if (!words.length) return fail('Make a word with at least two letters.');
  const invalid = words.filter((w) => !dictionary.has(w.word));
  if (invalid.length)
    return {
      ok: false,
      words,
      error: `${invalid.map((w) => w.word).join(', ')} ${invalid.length === 1 ? 'isn’t' : 'aren’t'} in our word list. Try another word.`,
    };
  const bingo = placements.length === 7;
  return {
    ok: true,
    board: next,
    words,
    score: words.reduce((n, w) => n + w.score, 0) + (bingo ? 50 : 0),
    bingo,
  };
}
function random(state: number): [number, number] {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return [(x >>> 0) / 4294967296, x >>> 0];
}
function shuffled<T>(items: T[], seed: number): [T[], number] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const [n, s] = random(seed);
    seed = s;
    const j = Math.floor(n * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return [result, seed];
}
export function createGame(
  mode: Mode,
  seed: number,
  supply: 'personal-60' | 'shared-100' = 'personal-60',
): Game {
  const personal = supply === 'personal-60';
  const tiles = personal
    ? [0, 1].flatMap((player) =>
        Object.entries(PERSONAL_DISTRIBUTION).flatMap(([letter, count]) =>
          Array.from({ length: count }, (_, i) => ({ id: `${player}:${letter}${i}`, letter })),
        ),
      )
    : Object.entries(DISTRIBUTION).flatMap(([letter, [count]]) =>
        Array.from({ length: count }, (_, i) => ({ id: `${letter}${i}`, letter })),
      );
  const [bag, rng] = shuffled(tiles, seed || 1);
  const racks = [draw(bag, 7, 0, personal), draw(bag, 7, 1, personal)];
  return {
    version: 1,
    dictionary: DICTIONARY_VERSION,
    mode,
    board: emptyBoard(),
    tileSupply: personal ? 'personal-60' : undefined,
    bag,
    racks,
    scores: racks.map(() => 0),
    turn: 0,
    history: [],
    scoreless: 0,
    rng,
    status: 'playing',
    endReason: null,
  };
}
function endTurn(game: Game, entry: HistoryEntry): Game {
  const next = {
    ...game,
    history: [...game.history, entry],
    scoreless: entry.score > 0 ? 0 : game.scoreless + 1,
  };
  const emptied =
    availableBag(next, entry.player).length === 0 && next.racks[entry.player].length === 0;
  if (emptied || next.scoreless >= 6) {
    const penalties = next.racks.map((rack) => rack.reduce((n, t) => n + tileValue(t.letter), 0));
    next.scores = next.scores.map((n, i) => n - penalties[i]);
    if (emptied && next.racks.length > 1)
      next.scores[entry.player] += penalties.reduce((n, p) => n + p, 0);
    next.status = 'finished';
    next.endReason = emptied ? 'rack-empty' : 'scoreless';
  } else next.turn = (game.turn + 1) % game.racks.length;
  return next;
}
export function playMove(
  game: Game,
  placements: Placement[],
  dictionary: ReadonlySet<string>,
): Game {
  if (game.status !== 'playing') throw new Error('This game has finished. Start a new game.');
  const result = evaluateMove(game.board, game.racks[game.turn], placements, dictionary);
  if (!result.ok) throw new Error(result.error);
  const used = new Set(placements.map((p) => p.tileId));
  const racks = game.racks.map((r) => r.slice()),
    bag = game.bag.slice(),
    scores = game.scores.slice();
  racks[game.turn] = racks[game.turn].filter((t) => !used.has(t.id));
  racks[game.turn].push(
    ...draw(bag, RACK_SIZE - racks[game.turn].length, game.turn, game.tileSupply === 'personal-60'),
  );
  scores[game.turn] += result.score;
  return endTurn(
    { ...game, board: result.board, racks, bag, scores },
    {
      player: game.turn,
      kind: 'play',
      words: result.words.map((w) => w.word),
      score: result.score,
      placements,
    },
  );
}
export function passTurn(game: Game): Game {
  if (game.status !== 'playing') throw new Error('This game has finished.');
  return endTurn(game, { player: game.turn, kind: 'pass', words: [], score: 0, placements: [] });
}
export function exchangeTiles(game: Game, ids: string[]): Game {
  if (game.status !== 'playing') throw new Error('This game has finished.');
  if (availableBag(game, game.turn).length < 7)
    throw new Error('You need at least seven tiles in the bag to swap.');
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !game.racks[game.turn].some((t) => t.id === id))
  )
    throw new Error('Choose tiles from your rack to swap.');
  const racks = game.racks.map((r) => r.slice());
  const returned = racks[game.turn].filter((t) => ids.includes(t.id));
  const bag = availableBag(game, game.turn).slice();
  racks[game.turn] = racks[game.turn].filter((t) => !ids.includes(t.id));
  racks[game.turn].push(...bag.splice(0, ids.length));
  const [mixed, rng] = shuffled([...bag, ...returned], game.rng);
  return endTurn(
    {
      ...game,
      racks,
      bag:
        game.tileSupply === 'personal-60'
          ? [...game.bag.filter((t) => !t.id.startsWith(`${game.turn}:`)), ...mixed]
          : mixed,
      rng,
    },
    { player: game.turn, kind: 'exchange', words: [], score: 0, placements: [] },
  );
}

export function resignGame(game: Game, player: number): Game {
  if (game.status !== 'playing') throw new Error('This game has finished.');
  if (player !== 0 && player !== 1) throw new Error('Invalid player.');
  return {
    ...game,
    status: 'finished',
    endReason: 'resigned',
    resignedBy: player,
    history: [...game.history, { player, kind: 'resign', words: [], score: 0, placements: [] }],
  };
}
export function winnerOf(game: { scores: number[]; resignedBy?: number }): number | null {
  if (game.resignedBy !== undefined) return 1 - game.resignedBy;
  return game.scores[0] === game.scores[1] ? null : game.scores[0] > game.scores[1] ? 0 : 1;
}
