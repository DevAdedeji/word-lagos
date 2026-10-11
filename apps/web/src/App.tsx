import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  Leaf,
  Plus,
  RotateCcw,
  Shuffle,
  SkipForward,
  Sparkles,
  Trophy,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  createGame,
  evaluateMove,
  exchangeTiles,
  makeLexicon,
  passTurn,
  playMove,
  premiumAt,
  tileValue,
  type Game,
  type Placement,
} from '@word-lagos/game-core';
import { loadGame, saveGame } from './storage';
import WordFeedback from './WordFeedback';
import ActionIcon from './ActionIcon';
import type { BotMove } from '../../../packages/game-core/src/bot';
type Modal = 'help' | 'new' | 'dictionary' | 'exchange' | 'history' | null;
const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const freshGame = (): Game => createGame('computer', crypto.getRandomValues(new Uint32Array(1))[0]);
const premiumNames = {
  TW: 'Triple word',
  DW: 'Double word',
  TL: 'Triple letter',
  DL: 'Double letter',
  '': 'Empty',
};
export default function App() {
  const [game, setGame] = useState<Game>(() => loadGame() ?? freshGame());
  const [draft, setDraft] = useState<Placement[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [wordsText, setWordsText] = useState(''),
    [loadError, setLoadError] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0);
  const [message, setMessage] = useState(''),
    [saveError, setSaveError] = useState(false),
    [botError, setBotError] = useState(''),
    [retry, setRetry] = useState(0);
  const [lookup, setLookup] = useState(''),
    [swapIds, setSwapIds] = useState<string[]>([]),
    [zoom, setZoom] = useState(false);
  const [blank, setBlank] = useState<{ tileId: string; row: number; col: number } | null>(null);
  const [rackOrder, setRackOrder] = useState<string[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const rackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!rackRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      appRef.current?.style.setProperty(
        '--rack-height',
        `${entry.borderBoxSize[0]?.blockSize ?? rackRef.current!.getBoundingClientRect().height}px`,
      );
    });
    observer.observe(rackRef.current);
    return () => observer.disconnect();
  }, []);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const zoomFocus = useRef({ x: 0.5, y: 0.5 });
  useEffect(() => {
    const viewport = boardScrollRef.current;
    if (!viewport) return;
    viewport.scrollLeft = zoom
      ? zoomFocus.current.x * viewport.scrollWidth - viewport.clientWidth / 2
      : 0;
    viewport.scrollTop = zoom
      ? zoomFocus.current.y * viewport.scrollHeight - viewport.clientHeight / 2
      : 0;
  }, [zoom]);
  function toggleZoom() {
    const viewport = boardScrollRef.current;
    if (viewport)
      zoomFocus.current = {
        x: (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth,
        y: (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight,
      };
    setZoom((value) => !value);
  }

  const dictionary = useMemo(() => makeLexicon(wordsText), [wordsText]);
  const isThinking = game.turn === 1 && game.status === 'playing';
  const canPlay = !!wordsText && !loadError && !isThinking && game.status === 'playing';
  const rack = game.racks[0];
  const orderedRack = [...rack].sort((a, b) => rackOrder.indexOf(a.id) - rackOrder.indexOf(b.id));
  const preview = useMemo(
    () => evaluateMove(game.board, rack, draft, dictionary),
    [game.board, rack, draft, dictionary],
  );
  const lastMove = game.history.at(-1);
  const lastCells = new Set(lastMove?.placements.map((p) => `${p.row},${p.col}`));
  const bestWord = game.history
    .filter((h) => h.player === 0 && h.kind === 'play')
    .sort((a, b) => b.score - a.score)[0];
  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    fetch('/words.txt', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Dictionary unavailable');
        return r.text();
      })
      .then((text) => {
        if (text.length < 1000 || text.includes('<html')) throw new Error('Dictionary unavailable');
        setWordsText(text);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setLoadError(true);
      });
    return () => controller.abort();
  }, [loadAttempt]);
  useEffect(() => {
    setSaveError(!saveGame(game));
  }, [game]);
  useEffect(() => {
    if (!isThinking || !wordsText) return;
    setBotError('');
    let active = true;
    const worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    const timer = window.setTimeout(() => {
      if (active) {
        setBotError('The computer took too long. Your game is saved. Try again.');
        worker.terminate();
      }
    }, 30000);
    worker.onmessage = (
      event: MessageEvent<{ id: number; move: BotMove | null; error?: string }>,
    ) => {
      if (!active) return;
      window.clearTimeout(timer);
      if (event.data.error) {
        setBotError(event.data.error);
        return;
      }
      try {
        let next: Game;
        if (event.data.move) {
          next = playMove(game, event.data.move.placements, dictionary);
          const move = next.history.at(-1)!;
          setMessage(`Ayo played ${move.words.join(' + ')} for ${move.score} points.`);
        } else if (game.bag.length >= 7) {
          next = exchangeTiles(
            game,
            game.racks[1].map((t) => t.id),
          );
          setMessage('Ayo swapped tiles. Your turn.');
        } else {
          next = passTurn(game);
          setMessage('Ayo passed. Your turn.');
        }
        setGame(next);
      } catch (e) {
        setBotError(e instanceof Error ? e.message : 'Could not complete the computer’s turn.');
      }
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      setBotError('The computer could not load. Try again.');
    };
    worker.postMessage({
      id: game.history.length,
      board: game.board,
      rack: game.racks[1],
      words: wordsText,
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
      worker.terminate();
    };
  }, [game, isThinking, wordsText, dictionary, retry]);
  useEffect(() => {
    if (!modal && !blank) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = modalRef.current;
    const focusable = 'button:not(:disabled), input, select, [tabindex="0"]';
    (
      (dialog?.querySelector('[autofocus]') as HTMLElement | null) ??
      dialog?.querySelector<HTMLElement>(focusable)
    )?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModal(null);
        setBlank(null);
      }
      if (event.key === 'Tab' && dialog) {
        const nodes = [...dialog.querySelectorAll<HTMLElement>(focusable)];
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [modal, blank]);
  function clearDraft() {
    setDraft([]);
    setSelected(null);
    setMessage('');
  }
  function place(row: number, col: number, tileId = selected, letter?: string) {
    if (!canPlay) return;
    const existing = draft.find((p) => p.row === row && p.col === col);
    if (existing) {
      setDraft((d) => d.filter((p) => p.tileId !== existing.tileId));
      setSelected(existing.tileId);
      setMessage('');
      return;
    }
    if (game.board[row][col]) return;
    if (!tileId) {
      setMessage('Choose a tile from your rack, then tap a square.');
      return;
    }
    const tile = rack.find((t) => t.id === tileId);
    if (!tile || draft.some((p) => p.tileId === tile.id)) return;
    if (tile.letter === '?' && !letter) {
      setBlank({ tileId, row, col });
      return;
    }
    setDraft((d) => [...d, { tileId: tile.id, row, col, letter: letter ?? tile.letter }]);
    setSelected(null);
    setMessage('');
    setBlank(null);
  }
  function submit() {
    try {
      setGame(playMove(game, draft, dictionary));
      clearDraft();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function action(kind: 'pass' | 'exchange') {
    try {
      setGame(kind === 'pass' ? passTurn(game) : exchangeTiles(game, swapIds));
      clearDraft();
      setModal(null);
      setSwapIds([]);
      setMessage(kind === 'pass' ? 'You passed this turn.' : 'Fresh tiles, fresh possibilities.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function start() {
    setGame(freshGame());
    clearDraft();
    setRackOrder([]);
    setModal(null);
    setBotError('');
    zoomFocus.current = { x: 0.5, y: 0.5 };
    setZoom(false);
  }
  function shuffle() {
    const ids = rack.map((t) => t.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setRackOrder(ids);
  }
  function drop(event: DragEvent, row: number, col: number) {
    event.preventDefault();
    place(row, col, event.dataTransfer.getData('text/plain'));
  }
  const finished = game.status === 'finished';
  const outcome =
    game.scores[0] === game.scores[1]
      ? 'A well-matched draw.'
      : game.scores[0] > game.scores[1]
        ? 'You’ve got a way with words.'
        : 'Ayo takes this one.';
  return (
    <div ref={appRef} className="app-shell min-h-screen bg-paper text-forest">
      <header className="mobile-game-header">
        <div className="mobile-topbar">
          <button aria-label="How to play" onClick={() => setModal('help')}>
            <CircleHelp size={21} />
          </button>
          <span className="mobile-game-title">WORD LAGOS</span>
          <button
            aria-label="New game"
            onClick={() => {
              setModal('new');
            }}
          >
            <Plus size={23} />
          </button>
        </div>
        <div className="mobile-scoreboard">
          <div className={`mobile-player ${!isThinking ? 'current-player' : ''}`}>
            <span className="mobile-avatar">Y</span>
            <span>
              You
              <strong>
                {game.scores[0]}
                {preview.ok && <small>+{preview.score}</small>}
              </strong>
            </span>
          </div>
          <span className="versus-tile">
            W<span>L</span>
          </span>
          <div className={`mobile-player opponent ${isThinking ? 'current-player' : ''}`}>
            <span>
              Ayo
              <strong>{game.scores[1]}</strong>
            </span>
            <span className="mobile-avatar bot-avatar">
              <Sparkles size={22} />
            </span>
          </div>
        </div>
        <div
          className={`mobile-play-status ${draft.length && !preview.ok ? 'invalid-play-status' : ''}`}
          role="status"
        >
          {finished
            ? outcome
            : !wordsText
              ? 'Loading dictionary…'
              : isThinking
                ? 'Ayo is thinking…'
                : draft.length
                  ? preview.ok
                    ? `${preview.words.map((w) => w.word).join(' + ')} · ${preview.score} points`
                    : preview.error
                  : message || 'Your turn · Make your next word count'}
        </div>
      </header>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Word Lagos home">
          <span className="brand-mark">
            w<span>l</span>
            <i />
          </span>
          <span>
            word<span className="brand-light">lagos</span>
            <span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-note">
          <span /> A little wordplay. A little Lagos.
        </span>
        <button className="quiet-button help-button" onClick={() => setModal('help')}>
          <CircleHelp size={17} />
          <span>How to play</span>
        </button>
      </header>
      <main>
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="sunburst">✳</span> THE WORD CLUB
            </div>
            <h1>
              Make your next word count<span>.</span>
            </h1>
            <p>Take your time. Find your word. Make it a good one.</p>
          </div>
          <button
            className="new-game-button"
            onClick={() => {
              setModal('new');
            }}
          >
            <Plus size={17} /> New game
          </button>
        </section>
        <div className="game-layout">
          <section className="play-area" aria-label="Game board and rack">
            <div className="board-toolbar">
              <div className="mode-label">
                <span className="live-dot" />
                You vs. Ayo
                <span className="mode-separator">/</span>
                <span className="casual-label">Friendly computer</span>
              </div>
              <button
                className="icon-button zoom-button"
                onClick={toggleZoom}
                aria-label={zoom ? 'Zoom out board' : 'Zoom in board'}
              >
                {zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
                <span>{zoom ? 'Full board' : 'Zoom in'}</span>
              </button>
              <button
                className="word-check history-toggle"
                onClick={() => setModal('history')}
                aria-label="View game history"
              >
                <Trophy size={15} />
              </button>
              <button className="word-check" onClick={() => setModal('dictionary')}>
                <BookOpen size={15} />
                <span>Word check</span>
              </button>
            </div>
            <div ref={boardScrollRef} className={`board-scroll ${zoom ? 'is-zoomed' : ''}`}>
              <div className="board-frame">
                <div className="board" role="group" aria-label="15 by 15 word board">
                  {game.board.flatMap((row, r) =>
                    row.map((tile, c) => {
                      const pending = draft.find((p) => p.row === r && p.col === c);
                      const premium = premiumAt(r, c);
                      const letter = tile?.letter ?? pending?.letter;
                      const isBlank =
                        tile?.blank ??
                        (pending && rack.find((t) => t.id === pending.tileId)?.letter === '?');
                      return (
                        <button
                          key={`${r}-${c}`}
                          className={`square premium-${premium || 'normal'} ${letter ? 'has-tile' : ''} ${pending ? `pending ${preview.ok ? 'pending-valid' : 'pending-invalid'}` : ''} ${tile && lastCells.has(`${r},${c}`) ? 'last-play' : ''} ${r === 7 && c === 7 ? 'centre' : ''}`}
                          onClick={() => place(r, c)}
                          onDragOver={(e) => {
                            if (canPlay) e.preventDefault();
                          }}
                          onDrop={(e) => drop(e, r, c)}
                          disabled={!canPlay || !!tile}
                          aria-label={`${String.fromCharCode(65 + c)}${r + 1}: ${letter ? `${letter}${isBlank ? ' blank' : ''}${pending ? ', placed tile, tap to recall' : ''}` : r === 7 && c === 7 ? 'Centre star, double word' : premiumNames[premium]}`}
                        >
                          {letter ? (
                            <>
                              <span className="tile-letter">{letter}</span>
                              <sub>{isBlank ? 0 : tileValue(letter)}</sub>
                              {isBlank && <i className="blank-dot" />}
                            </>
                          ) : r === 7 && c === 7 ? (
                            <span className="centre-star">✦</span>
                          ) : premium ? (
                            <span className="premium-text">
                              {premium[0]}
                              <br />
                              {premium[1]}
                            </span>
                          ) : null}
                        </button>
                      );
                    }),
                  )}
                  {preview.words && <WordFeedback words={preview.words} />}
                </div>
              </div>
            </div>
            <div className="board-legend">
              <span>
                <i className="legend-tw" />
                Triple word
              </span>
              <span>
                <i className="legend-dw" />
                Double word
              </span>
              <span>
                <i className="legend-tl" />
                Triple letter
              </span>
              <span>
                <i className="legend-dl" />
                Double letter
              </span>
            </div>
            <div ref={rackRef} className="rack-panel">
              <div className="rack-topline">
                <span>
                  <span className="rack-score">
                    You <strong>{game.scores[0]}</strong>
                    {preview.ok && <b className="projected-score">+{preview.score}</b>}
                  </span>
                  <span className="rack-opponent">
                    Ayo <strong>{game.scores[1]}</strong>
                  </span>
                  <span className="rack-count">{rack.length - draft.length} tiles</span>
                </span>
                <button
                  className="shuffle-button"
                  onClick={shuffle}
                  disabled={!canPlay}
                  aria-label="Shuffle your rack"
                >
                  <Shuffle size={15} />
                  Shuffle
                </button>
              </div>
              <div className="rack" aria-label="Your tile rack">
                {orderedRack.map((t) => {
                  const used = draft.some((p) => p.tileId === t.id);
                  return (
                    <button
                      key={t.id}
                      className={`rack-tile ${used ? 'used' : ''} ${selected === t.id ? 'selected' : ''}`}
                      disabled={used || !canPlay}
                      aria-label={`${t.letter === '?' ? 'Blank' : t.letter} tile, ${tileValue(t.letter)} points`}
                      aria-pressed={selected === t.id}
                      onClick={() => {
                        setSelected(selected === t.id ? null : t.id);
                        setMessage('');
                      }}
                      draggable={canPlay && !used}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', t.id);
                        setSelected(t.id);
                      }}
                    >
                      {!used && (
                        <>
                          <span>{t.letter === '?' ? '' : t.letter}</span>
                          <sub>{tileValue(t.letter)}</sub>
                          {t.letter === '?' && <i className="blank-rack-mark" />}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
              <div
                className={`turn-message ${draft.length && !preview.ok ? 'draft-message' : ''}`}
                role="status"
              >
                {loadError ? (
                  <span>
                    Couldn’t load the word list.{' '}
                    <button onClick={() => setLoadAttempt((n) => n + 1)}>Retry</button>
                  </span>
                ) : !wordsText ? (
                  'Getting the word list ready…'
                ) : botError ? (
                  <span>
                    {botError} <button onClick={() => setRetry((n) => n + 1)}>Retry turn</button>
                  </span>
                ) : finished ? (
                  'Game complete. Ready for another round?'
                ) : isThinking ? (
                  <span className="thinking">
                    <i />
                    <i />
                    <i /> Ayo is finding a word…
                  </span>
                ) : (
                  message ||
                  (draft.length ? (
                    preview.ok ? (
                      <span className="sr-only">
                        Valid {preview.words.map((w) => w.word).join(' and ')}. {preview.score}{' '}
                        points. Ready to submit.
                      </span>
                    ) : (
                      <span>{preview.error}</span>
                    )
                  ) : selected ? (
                    'Now tap a square to place your tile.'
                  ) : (
                    'Tap a tile, then a square. Your next good word starts here.'
                  ))
                )}
              </div>
              <div className="rack-actions">
                <ActionIcon
                  label="Recall tiles"
                  onClick={clearDraft}
                  disabled={!canPlay || !draft.length}
                >
                  <RotateCcw size={24} />
                </ActionIcon>
                <ActionIcon
                  label="Swap tiles"
                  onClick={() => {
                    setSwapIds([]);
                    setModal('exchange');
                  }}
                  disabled={!canPlay || game.bag.length < 7}
                >
                  <Shuffle size={24} />
                </ActionIcon>
                <ActionIcon
                  label="Pass turn"
                  onClick={() => action('pass')}
                  disabled={!canPlay || !!draft.length}
                >
                  <SkipForward size={24} />
                </ActionIcon>
                <button className="play-button" onClick={submit} disabled={!canPlay || !preview.ok}>
                  Submit {preview.ok && <span>+{preview.score}</span>}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </section>
          <aside className="sidebar">
            <section className="match-card">
              <div className="card-topline">
                <h2>Your table</h2>
                <span className="pill">{finished ? 'FINISHED' : 'SOLO SESSION'}</span>
              </div>
              <div className={`player-row ${!isThinking && !finished ? 'active-player' : ''}`}>
                <div className="avatar you-avatar">Y</div>
                <div className="player-info">
                  <h3>
                    You <span>That’s you</span>
                  </h3>
                  <p>
                    {finished
                      ? 'Well played'
                      : isThinking
                        ? 'A word worth waiting for'
                        : game.history.length
                          ? 'Your move'
                          : 'You’re up first'}
                  </p>
                </div>
                <strong className="player-score">{game.scores[0]}</strong>
              </div>
              <div className={`player-row ${isThinking ? 'active-player' : ''}`}>
                <div className="avatar ayo-avatar">
                  <Sparkles size={21} />
                </div>
                <div className="player-info">
                  <h3>
                    Ayo <span>Computer</span>
                  </h3>
                  <p>{isThinking ? 'Thinking of something good…' : 'Your friendly word rival'}</p>
                </div>
                <strong className="player-score">{game.scores[1]}</strong>
              </div>
              <div className="match-stats">
                <div>
                  <span>{game.bag.length}</span>
                  <p>Tiles in the bag</p>
                </div>
                <div>
                  <span>{game.history.length + (finished ? 0 : 1)}</span>
                  <p>{finished ? 'Turns played' : 'Turn number'}</p>
                </div>
              </div>
              <div className="save-status">
                {saveError ? (
                  <>
                    <WifiOff size={13} /> Saving unavailable in this browser
                  </>
                ) : (
                  <>
                    <Check size={13} /> Progress saved on this device
                  </>
                )}
              </div>
            </section>
            {finished ? (
              <section className="finish-card">
                <Trophy size={27} />
                <h2>{outcome}</h2>
                <p>
                  {game.endReason === 'rack-empty'
                    ? 'The last tile is down.'
                    : 'Six turns without a score.'}{' '}
                  Unplayed tile values have been deducted
                  {game.endReason === 'rack-empty' ? ' and awarded to the player who finished' : ''}
                  .
                </p>
                <button
                  onClick={() => {
                    setModal('new');
                  }}
                >
                  Another round <ArrowRight size={16} />
                </button>
              </section>
            ) : (
              <section className="tip-card">
                <div className="tip-heading">
                  <Leaf size={16} />
                  <span>A LITTLE WORD WISDOM</span>
                </div>
                <p>
                  {game.history.length
                    ? 'Small words. Big possibilities.'
                    : 'Every great game starts with one little word.'}
                </p>
                <span>
                  {game.history.length
                    ? 'Two-letter words can turn a tight corner into your next big score.'
                    : 'Place your first word across the centre star. It’s a double word score.'}
                </span>
                <div className="tip-illustration" aria-hidden="true">
                  <span>Ẹ</span>
                  <span>
                    K<sub>5</sub>
                  </span>
                  <span>
                    O<sub>1</sub>
                  </span>
                  <i>✳</i>
                </div>
              </section>
            )}
            <section className="history-card">
              <div className="card-topline">
                <h2>The word trail</h2>
                <span>
                  {game.history.length ? `${game.history.length} turns` : 'A fresh start'}
                </span>
              </div>
              {game.history.length ? (
                <ol className="history-list list-none overflow-y-auto">
                  {game.history
                    .slice()
                    .reverse()
                    .slice(0, 20)
                    .map((h, i) => (
                      <li key={game.history.length - i}>
                        <span className={`history-dot ${h.player ? 'bot-dot' : ''}`} />
                        <div>
                          <strong>
                            {h.kind === 'play'
                              ? h.words.join(' · ')
                              : h.kind === 'pass'
                                ? 'Passed the turn'
                                : 'Swapped tiles'}
                          </strong>
                          <span>
                            {h.player ? 'Ayo' : 'You'} · Turn {game.history.length - i}
                          </span>
                        </div>
                        <b>{h.kind === 'play' ? `+${h.score}` : '—'}</b>
                      </li>
                    ))}
                </ol>
              ) : (
                <div className="empty-history">
                  <span>“</span>
                  <p>
                    A blank board.
                    <br />
                    So many possibilities.
                  </p>
                  <small>Your words will find a home here.</small>
                </div>
              )}
            </section>
            {bestWord && (
              <div className="best-word">
                <Trophy size={16} />
                <span>
                  Your best turn <strong>{bestWord.words[0]}</strong>
                </span>
                <b>+{bestWord.score}</b>
              </div>
            )}
          </aside>
        </div>
        <footer>
          <span>
            MADE FOR THE LOVE OF WORDS <span>✳</span>
          </span>
          <span>
            Solo edition <span className="footer-dot">·</span> Friends at the table, soon.
          </span>
        </footer>
      </main>
      {(modal || blank) && (
        <div
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setModal(null);
              setBlank(null);
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            ref={modalRef}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => {
                setModal(null);
                setBlank(null);
              }}
            >
              <X size={20} />
            </button>
            {blank ? (
              <>
                <div className="eyebrow">A LITTLE POSSIBILITY</div>
                <h2 id="dialog-title">Pick your blank’s letter.</h2>
                <p>A blank can be any letter. It’s always worth zero points.</p>
                <div className="alphabet-grid grid grid-cols-7">
                  {alphabet.map((l) => (
                    <button key={l} onClick={() => place(blank.row, blank.col, blank.tileId, l)}>
                      {l}
                    </button>
                  ))}
                </div>
              </>
            ) : modal === 'new' ? (
              <>
                <div className="eyebrow">PULL UP A CHAIR</div>
                <h2 id="dialog-title">A fresh board awaits.</h2>
                <p>
                  Play against Ayo, your computer opponent.
                  {game.history.length > 0 && !finished
                    ? ' Starting again replaces your saved game.'
                    : ''}
                </p>
                <button className="play-button modal-primary" onClick={start}>
                  Let’s play <ArrowRight size={18} />
                </button>
              </>
            ) : modal === 'history' ? (
              <>
                <div className="eyebrow">YOUR TABLE</div>
                <h2 id="dialog-title">{finished ? outcome : 'The word trail'}</h2>
                <p>
                  You: {game.scores[0]}
                  {` · Ayo: ${game.scores[1]}`} · {game.bag.length} tiles left
                </p>
                {finished && <p>Remaining tile values have been deducted from the final scores.</p>}
                <ol className="history-list">
                  {game.history
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <li key={i}>
                        <div>
                          <strong>
                            {h.kind === 'play'
                              ? h.words.join(' · ')
                              : h.kind === 'pass'
                                ? 'Passed'
                                : 'Swapped tiles'}
                          </strong>
                          <span>
                            {h.player ? 'Ayo' : 'You'} · Turn {game.history.length - i}
                          </span>
                        </div>
                        <b>{h.score ? `+${h.score}` : '—'}</b>
                      </li>
                    ))}
                </ol>
                {!game.history.length && <p>Your first word starts the story.</p>}
                <button
                  className="play-button modal-primary"
                  onClick={() => {
                    setModal('new');
                  }}
                >
                  New game <Plus size={18} />
                </button>
              </>
            ) : modal === 'help' ? (
              <>
                <div className="eyebrow">WELCOME TO THE TABLE</div>
                <h2 id="dialog-title">Good words start here.</h2>
                <ol className="rules">
                  <li>
                    <strong>Pick. Place. Play.</strong>
                    <p>
                      Tap a tile, then a square. Tap a placed tile to take it back. You can also
                      drag tiles from your rack.
                    </p>
                  </li>
                  <li>
                    <strong>Keep it connected.</strong>
                    <p>
                      Your first word covers the centre star. After that, connect to the board.
                      Place new tiles in one row or column; every word formed must be valid.
                    </p>
                  </li>
                  <li>
                    <strong>Make the squares count.</strong>
                    <p>
                      DL and TL multiply a letter. DW and TW multiply the whole word. Bonuses apply
                      only when a tile is first placed. Use all seven tiles for 50 extra points.
                    </p>
                  </li>
                  <li>
                    <strong>Find your next move.</strong>
                    <p>
                      Blank tiles can be any letter and score zero. Swap tiles when at least seven
                      remain in the bag; swapping uses your turn. Pass when you need to.
                    </p>
                  </li>
                  <li>
                    <strong>Finish strong.</strong>
                    <p>
                      The game ends when the bag is empty and a rack is cleared, or after six
                      consecutive scoreless turns. Unplayed tiles are deducted; a player who empties
                      their rack receives their opponent’s remaining tile points.
                    </p>
                  </li>
                </ol>
                <p className="dictionary-note">
                  We use the English word-list dictionary, version 4.1.0. This is casual wordplay,
                  not an official tournament word list.{' '}
                  <a href="/dictionary-license.txt" target="_blank" rel="noreferrer">
                    Dictionary credits <ArrowUpRight size={12} />
                  </a>
                </p>
              </>
            ) : modal === 'dictionary' ? (
              <>
                <div className="eyebrow">A LITTLE WORD CONFIDENCE</div>
                <h2 id="dialog-title">Is that a word?</h2>
                <p>Check our English word list before you commit.</p>
                <label className="lookup-label" htmlFor="word-lookup">
                  Your word
                </label>
                <input
                  id="word-lookup"
                  autoFocus
                  className="word-input"
                  placeholder="Try LAGOS… or HELLO"
                  maxLength={15}
                  value={lookup}
                  onChange={(e) => setLookup(e.target.value.replace(/[^a-z]/gi, '').toUpperCase())}
                />
                {lookup.length >= 2 && wordsText ? (
                  <div className={`lookup-result ${dictionary.has(lookup) ? 'valid' : 'invalid'}`}>
                    {dictionary.has(lookup) ? <Check size={21} /> : <X size={21} />}
                    <span>
                      <strong>{lookup}</strong>
                      {dictionary.has(lookup)
                        ? ' is in our word list.'
                        : ' isn’t in our word list.'}
                    </span>
                  </div>
                ) : (
                  <p className="lookup-hint">
                    {wordsText ? 'Enter at least two letters.' : 'The word list is loading…'}
                  </p>
                )}
                <p className="dictionary-note">
                  Check a word before submitting. Board placement and any crossing words still need
                  to be valid.
                </p>
              </>
            ) : (
              <>
                <div className="eyebrow">CHANGE YOUR LETTERS</div>
                <h2 id="dialog-title">Fresh tiles, fresh ideas.</h2>
                <p>
                  Choose tiles to swap. This uses your turn and recalls any tiles you’ve placed.
                </p>
                <div className="exchange-rack">
                  {rack.map((t) => (
                    <button
                      className={`rack-tile ${swapIds.includes(t.id) ? 'selected' : ''}`}
                      key={t.id}
                      aria-label={`Swap ${t.letter === '?' ? 'blank' : t.letter} tile`}
                      aria-pressed={swapIds.includes(t.id)}
                      onClick={() =>
                        setSwapIds((ids) =>
                          ids.includes(t.id) ? ids.filter((id) => id !== t.id) : [...ids, t.id],
                        )
                      }
                    >
                      <span>{t.letter === '?' ? '' : t.letter}</span>
                      <sub>{tileValue(t.letter)}</sub>
                    </button>
                  ))}
                </div>
                <button
                  className="play-button modal-primary"
                  disabled={!swapIds.length}
                  onClick={() => action('exchange')}
                >
                  Swap {swapIds.length || ''} {swapIds.length === 1 ? 'tile' : 'tiles'}{' '}
                  <Shuffle size={17} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
