import { useState } from 'react';
import { ArrowRight, Users } from 'lucide-react';
import { createFriendGame } from './client';

export default function FriendLobby({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create() {
    setBusy(true);
    setError('');
    try {
      onJoin(await createFriendGame());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create your game.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="friend-lobby">
      <Users size={28} />
      <h2 id="dialog-title">Words are better together.</h2>
      <p>Invite a friend for a friendly match. Take turns and make every tile count.</p>
      <button className="play-button modal-primary" disabled={busy} onClick={() => void create()}>
        {busy ? 'Creating game…' : 'Create a game'}
        <ArrowRight size={18} />
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onJoin(code);
        }}
      >
        <label htmlFor="friend-code">Have a game code?</label>
        <div className="friend-code-input">
          <input
            id="friend-code"
            value={code}
            onChange={(event) =>
              setCode(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, '')
                  .slice(0, 6),
              )
            }
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={6}
            placeholder="ABCDEF"
          />
          <button className="new-game-button" disabled={busy || code.length !== 6}>
            Join
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="friend-error">
          {error}
        </p>
      )}
      <small>Games stay available for seven days. Keep your code to return.</small>
    </div>
  );
}
