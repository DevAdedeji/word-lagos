import DiamondIcon from './DiamondIcon';
import { Sparkles, RotateCcw } from 'lucide-react';
import { diamondPacks, HINT_COST } from '@word-lagos/multiplayer';
import type { Diamonds } from './useDiamonds';
export default function DiamondShop({ wallet }: { wallet: Diamonds }) {
  return (
    <div className="diamond-shop">
      <div className="eyebrow">A LITTLE INSPIRATION</div>
      <h2 id="dialog-title">Your next word awaits.</h2>
      <p>
        Stuck on a word? Use {HINT_COST} diamonds to automatically play your highest-scoring move.
      </p>
      <div className="diamond-balance-card">
        <span className="diamond-emblem">
          <DiamondIcon size={34} />
        </span>
        <div>
          <span>Your diamonds</span>
          {wallet.balance === null ? (
            <span className="diamond-skeleton" aria-label="Loading diamond balance" />
          ) : (
            <strong>{Math.max(0, wallet.balance).toLocaleString()}</strong>
          )}
        </div>
        <Sparkles size={22} />
      </div>
      {wallet.demo && (
        <div className="diamond-demo">Preview mode · Packs add test diamonds. No real payment.</div>
      )}
      {!wallet.enabled && (
        <p className="diamond-note">Open WordPadi inside LagosLife to use your diamond wallet.</p>
      )}
      {wallet.balance !== null && wallet.balance < 0 && (
        <p className="diamond-note">
          A refunded pack was already used. New diamonds first cover the {Math.abs(wallet.balance)}
          -diamond adjustment.
        </p>
      )}
      <div className="diamond-packs">
        {diamondPacks.map((pack) => (
          <button
            key={pack.id}
            disabled={!wallet.enabled || wallet.busy || wallet.balance === null}
            onClick={() => void wallet.buy(pack.id)}
          >
            <DiamondIcon size={25} />
            <span>
              <strong>{pack.diamonds} diamonds</strong>
              <small>{pack.diamonds / HINT_COST} automatic plays</small>
            </span>
            <b>{`₦${pack.price.toLocaleString()}`}</b>
          </button>
        ))}
      </div>
      <p className="diamond-note">
        10 welcome diamonds, once per account. Your balance works across games. No diamonds are
        spent if no playable word is found.
      </p>
      {wallet.error && (
        <p className="diamond-error" role="alert">
          {wallet.error}
        </p>
      )}
      <button
        className="diamond-restore"
        disabled={!wallet.enabled || wallet.busy}
        onClick={() => void wallet.restore()}
      >
        <RotateCcw size={15} />
        {wallet.busy ? 'Please wait…' : 'Restore purchases'}
      </button>
      {!wallet.demo && (
        <p className="diamond-payment-note">
          One-time packs · Prices are real naira · Checkout by LagosLife
        </p>
      )}
    </div>
  );
}
