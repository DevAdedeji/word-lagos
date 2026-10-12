import DiamondIcon from './DiamondIcon';
import { Sparkles } from 'lucide-react';
import { HINT_COST } from '@word-lagos/multiplayer';
import type { Diamonds } from './useDiamonds';
export default function HintPanel({
  wallet,
  searched,
  onFind,
  onShop,
  canFind,
}: {
  wallet: Diamonds;
  searched: boolean;
  onFind: () => void;
  onShop: () => void;
  canFind: boolean;
}) {
  const enough = wallet.balance !== null && wallet.balance >= HINT_COST;
  return (
    <div className="hint-panel">
      <span className="hint-emblem">
        <Sparkles size={30} />
      </span>
      <div className="eyebrow">MAKE THIS TURN COUNT</div>
      <h2 id="dialog-title">Play your best word.</h2>
      <p>
        We’ll find and submit the highest-scoring legal move using your tiles, then pass the turn to
        your opponent.
      </p>
      <p className="diamond-note">
        Includes crossing words and board bonuses. Unsubmitted tiles are replaced. No playable move?
        No diamonds spent.
      </p>
      {wallet.busy ? (
        <div className="hint-loading" role="status" aria-label="Playing your best word">
          {Array.from({ length: 5 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
      ) : (
        searched && (
          <p className="diamond-note">No playable move was found. No diamonds were spent.</p>
        )
      )}
      {wallet.enabled && (
        <button
          className="modal-primary"
          disabled={wallet.busy || wallet.balance === null || !canFind}
          onClick={onFind}
        >
          {enough ? (
            <>
              <Sparkles size={18} /> Play best word{' '}
              <span>
                · {HINT_COST} <DiamondIcon size={15} />
              </span>
            </>
          ) : (
            'Recover previous play'
          )}
        </button>
      )}
      {!enough && wallet.enabled && (
        <button className="diamond-restore" disabled={wallet.busy} onClick={onShop}>
          Get diamonds
        </button>
      )}
      {!canFind && <p className="diamond-note">Available on your turn in an active game.</p>}
      {!wallet.enabled && (
        <p className="diamond-note">Open WordPadi in LagosLife to use Play a word.</p>
      )}
      {wallet.error && (
        <p className="diamond-error" role="alert">
          {wallet.error}
        </p>
      )}
      <button className="hint-wallet" disabled={wallet.busy} onClick={onShop}>
        <DiamondIcon size={15} />
        {wallet.balance === null
          ? 'Your diamond wallet'
          : `${Math.max(0, wallet.balance)} diamonds available`}
      </button>
      <p className="diamond-note">Retrying an interrupted play never charges twice.</p>
    </div>
  );
}
