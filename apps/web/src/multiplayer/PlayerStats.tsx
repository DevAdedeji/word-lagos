import { Trophy, Sparkles, Medal, Crown, Flame, BookOpen, ArrowUpRight } from 'lucide-react';
import type { usePlayerStats } from './usePlayerStats';
export default function PlayerStats({ account }: { account: ReturnType<typeof usePlayerStats> }) {
  const { stats, error } = account;
  if (!stats)
    return (
      <div className="stats-panel">
        <div className="eyebrow">YOUR WORD STORY</div>
        <h2 id="dialog-title">Every word adds up.</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="quiet-button" onClick={account.retry}>
              Try again
            </button>
          </>
        ) : (
          <div role="status">
            <span className="sr-only">Loading player stats</span>
            <div aria-hidden="true" className="space-y-4 py-6 motion-safe:animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-[#e9efdc]" />
              ))}
            </div>
            <p>Your friend-game stats appear when you connect through LagosLife.</p>
          </div>
        )}
      </div>
    );
  const badges = [
    {
      name: 'First of many',
      detail: 'Win your first game',
      value: stats.wins,
      goal: 1,
      icon: Trophy,
    },
    {
      name: 'Word collector',
      detail: 'Play 50 words',
      value: stats.words,
      goal: 50,
      icon: BookOpen,
    },
    { name: 'Hat trick', detail: 'Win 3 games', value: stats.wins, goal: 3, icon: Medal },
    {
      name: 'Big energy',
      detail: 'Score 50 in one move',
      value: stats.bestMove,
      goal: 50,
      icon: Flame,
    },
    {
      name: 'All in',
      detail: 'Play all 7 tiles at once',
      value: stats.bingos,
      goal: 1,
      icon: Sparkles,
    },
    {
      name: 'At home here',
      detail: 'Complete 10 games',
      value: stats.played,
      goal: 10,
      icon: Crown,
    },
  ];
  return (
    <div className="stats-panel">
      <div className="games-heading">
        <div className="eyebrow">YOUR WORD STORY</div>
        <h2 id="dialog-title">Every word adds up.</h2>
        <p>Your friend matches, all in one place.</p>
      </div>
      <div className="games-scroll">
        <div className="stats-hero">
          <span className="stats-emblem">
            <Trophy size={29} />
          </span>
          <div>
            <small>GAMES WON</small>
            <strong>
              {stats.wins}
              <span> / {stats.played} played</span>
            </strong>
          </div>
          <span className="stats-win-rate">
            {stats.played ? Math.round((stats.wins / stats.played) * 100) : 0}%
            <small>win rate</small>
          </span>
        </div>
        <div className="stats-strip">
          <span>
            <b>{stats.losses}</b> Losses
          </span>
          <span>
            <b>{stats.draws}</b> Draws
          </span>
          <span>
            <b>{stats.words}</b> Words played
          </span>
        </div>
        <div className="stats-personal">
          <div>
            <small>BEST GAME</small>
            <strong>
              {stats.bestScore ?? '—'}
              <span>pts</span>
            </strong>
          </div>
          <div>
            <small>BEST MOVE</small>
            <strong>
              {stats.bestMove}
              <span>pts</span>
            </strong>
            <p>{stats.bestWords.join(' + ') || 'Your next word could be it.'}</p>
          </div>
        </div>
        <div className="achievement-heading">
          <h3>Your little victories</h3>
          <span>
            {badges.filter((b) => b.value >= b.goal).length} / {badges.length}
          </span>
        </div>
        <div className="achievements">
          {badges.map(({ name, detail, value, goal, icon: Icon }) => (
            <div key={name} className={`achievement ${value >= goal ? 'earned' : ''}`}>
              <span className="achievement-icon">
                <Icon size={23} />
              </span>
              <strong>{name}</strong>
              <small>{detail}</small>
              <div
                className="achievement-progress"
                role="progressbar"
                aria-label={name}
                aria-valuemin={0}
                aria-valuemax={goal}
                aria-valuenow={Math.min(goal, value)}
              >
                <span style={{ width: `${Math.min(100, (value / goal) * 100)}%` }} />
              </div>
              <span className="achievement-caption">
                {value >= goal ? (
                  <>
                    <Sparkles size={10} /> Unlocked
                  </>
                ) : (
                  `${value} / ${goal}`
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="games-note">
          <ArrowUpRight size={13} /> Friend matches sync to your account. Ayo games stay on this
          device and aren’t included. Achievements are earned, never bought.
        </p>
        {error && (
          <p role="alert" className="friend-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
