import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Plus, RefreshCw, Sparkles, Trophy, Users } from 'lucide-react';
import type { Game } from '@word-lagos/game-core';
import type { GameSummary, PlayerRecord } from '@word-lagos/multiplayer';
import { listFriendGames, playerRecord } from './client';

export default function MyGames({
  computer,
  currentCode,
  onComputer,
  onJoin,
  onNew,
}: {
  computer: Game;
  currentCode: string | null;
  onComputer: () => void;
  onJoin: (code: string) => void;
  onNew: () => void;
}) {
  const [tab, setTab] = useState<'active' | 'records'>('active');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [recordCode, setRecordCode] = useState<string | null>(null);
  const [record, setRecord] = useState<PlayerRecord | null>(null);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    let fetching = false;
    const fetchData = async () => {
      if (fetching) return;
      fetching = true;
      try {
        if (recordCode) {
          const result = await playerRecord(recordCode);
          if (active) setRecord(result);
        } else {
          const refreshed: GameSummary[] = [];
          let next: number | null = 0;
          do {
            const result = await listFriendGames(tab === 'records', next);
            if (!active) return;
            refreshed.push(...result.games);
            next = result.nextOffset;
          } while (next !== null && next <= offset);
          if (active) {
            setGames([...new Map(refreshed.map((game) => [game.code, game])).values()]);
            setNextOffset(next);
          }
        }
        if (active) setError('');
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your games.');
      } finally {
        fetching = false;
        if (active) setBusy(false);
      }
    };
    void fetchData();
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void fetchData();
    };
    const interval = window.setInterval(refreshVisible, 15000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [tab, offset, attempt, recordCode]);
  function showRecord(code: string) {
    setRecord(null);
    setRecordCode(code);
  }
  return (
    <div className="my-games">
      {recordCode ? (
        <>
          <div className="games-heading">
            <button
              className="quiet-button"
              onClick={() => {
                setRecordCode(null);
                setRecord(null);
                setOffset(0);
              }}
            >
              <ArrowLeft size={17} /> My games
            </button>
            <div className="eyebrow">HEAD TO HEAD</div>
            <h2 id="dialog-title">You &amp; {record?.opponent ?? 'your padi'}</h2>
          </div>
          <div className="games-scroll" key="record">
            {record && (
              <>
                <p>
                  {record.played} {record.played === 1 ? 'game' : 'games'} completed together
                </p>
                <div className="record-counts grid grid-cols-3 gap-2">
                  <div>
                    <strong>{record.wins}</strong>
                    <span>Your wins</span>
                  </div>
                  <div>
                    <strong>{record.draws}</strong>
                    <span>Draws</span>
                  </div>
                  <div>
                    <strong>{record.losses}</strong>
                    <span>Their wins</span>
                  </div>
                </div>
                <h3>Recent games</h3>
                {!record.recent.length && (
                  <p>Your first result will appear when you finish a game together.</p>
                )}
                <ol className="game-list">
                  {record.recent.map((g) => (
                    <li key={g.code} className="game-list-card">
                      <div>
                        <strong>{resultLabel(g)}</strong>
                        <small>
                          {new Date(g.updatedAt).toLocaleDateString()} · {g.code}
                        </small>
                      </div>
                      <b>
                        {g.scores[0]} <span>–</span> {g.scores[1]}
                      </b>
                    </li>
                  ))}
                </ol>
                <p className="games-note">
                  Counts include all completed friend games. The latest 20 are shown here.
                </p>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="games-heading">
            <div className="eyebrow">PULL UP YOUR CHAIR</div>
            <h2 id="dialog-title">My games</h2>
            <p>Pick up where you left off.</p>
            <div className="games-tabs flex gap-2" role="group" aria-label="Game lists">
              <button
                aria-pressed={tab === 'active'}
                onClick={() => {
                  if (tab === 'active') return;
                  setNextOffset(null);
                  setTab('active');
                  setOffset(0);
                  setGames([]);
                }}
              >
                Active games
              </button>
              <button
                aria-pressed={tab === 'records'}
                onClick={() => {
                  if (tab === 'records') return;
                  setNextOffset(null);
                  setTab('records');
                  setOffset(0);
                  setGames([]);
                }}
              >
                Records
              </button>
            </div>
          </div>
          <div className="games-scroll" key={tab}>
            <ul className="game-list">
              {tab === 'active' && computer.status === 'playing' && (
                <li className="game-list-card">
                  <button className="game-resume" onClick={onComputer}>
                    <span className="game-avatar">
                      <Sparkles size={23} />
                    </span>
                    <span>
                      <strong>Ayo</strong>
                      <small>
                        Computer · {computer.scores[0]} – {computer.scores[1]}
                      </small>
                      <span className="game-turn">
                        {computer.turn === 0 ? 'Your turn' : 'Ayo’s turn'}
                        {!currentCode ? ' · Playing now' : ''}
                      </span>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                </li>
              )}
              {games.map((g) => (
                <li key={g.code} className="game-list-card">
                  <button
                    className="game-resume"
                    onClick={() => (tab === 'records' ? showRecord(g.code) : onJoin(g.code))}
                  >
                    <span className="game-avatar">
                      <Users size={23} />
                    </span>
                    <span>
                      <strong>{g.opponent ?? 'Waiting for a padi'}</strong>
                      <small>
                        {g.scores[0]} – {g.scores[1]} · {g.code}
                      </small>
                      <span className={`game-turn ${g.yourTurn ? 'your-turn' : ''}`}>
                        {g.phase === 'finished'
                          ? resultLabel(g)
                          : g.phase === 'waiting'
                            ? 'Share your code'
                            : g.yourTurn
                              ? 'Your turn'
                              : 'Their turn'}
                        {g.code === currentCode ? ' · Playing now' : ''}
                      </span>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                  {tab === 'active' && g.opponent && (
                    <button
                      className="game-record-link"
                      onClick={() => showRecord(g.code)}
                      aria-label={`View record with ${g.opponent}`}
                    >
                      <Trophy size={14} /> Head to head
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {!busy && !error && !games.length && (
              <p>
                {tab === 'records'
                  ? 'No completed friend games yet. Finish a match to start your record.'
                  : 'No active friend games. Invite a padi to get started.'}
              </p>
            )}
            {nextOffset !== null && !error && (
              <button
                className="quiet-button"
                disabled={busy}
                onClick={() => setOffset(nextOffset)}
              >
                Load more
              </button>
            )}
            <p className="games-note">
              Ayo and unsubmitted tiles are saved on this device. Friend games stay active for seven
              days.
            </p>
          </div>
          <div className="games-footer">
            <button className="play-button modal-primary" onClick={onNew}>
              <Plus size={18} /> New game
            </button>
          </div>
        </>
      )}
      {busy && <p role="status">Loading {recordCode ? 'your record' : 'friend games'}…</p>}
      {error && (
        <div role="alert">
          <p className="friend-error">{error}</p>
          <button className="quiet-button" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      )}
    </div>
  );
}
function resultLabel(game: GameSummary) {
  return game.scores[0] === game.scores[1]
    ? 'Draw'
    : game.scores[0] > game.scores[1]
      ? 'You won'
      : 'They won';
}
