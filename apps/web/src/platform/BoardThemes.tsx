import { Check, Palette } from 'lucide-react';
import type { usePlatform } from './usePlatform';
export default function BoardThemes({ platform }: { platform: ReturnType<typeof usePlatform> }) {
  return (
    <div className="board-themes">
      <div className="eyebrow">MAKE YOURSELF AT HOME</div>
      <h2 id="dialog-title">Your board. Your style.</h2>
      <p>
        Keep the classic look or enjoy warm sunset colours. Themes change the look, never the rules
        or your score.
      </p>
      <div className="theme-options">
        <button
          className="theme-option"
          aria-pressed={platform.theme === 'classic'}
          onClick={() => platform.chooseTheme('classic')}
        >
          <span className="theme-swatch classic-swatch" aria-hidden="true" />
          <strong>Classic</strong>
          <span>Always free</span>
          {platform.theme === 'classic' && <Check size={18} />}
        </button>
        <button
          className="theme-option"
          aria-pressed={platform.theme === 'sunset'}
          disabled={!platform.owned}
          onClick={() => platform.chooseTheme('sunset')}
        >
          <span className="theme-swatch sunset-swatch" aria-hidden="true" />
          <strong>Sunset</strong>
          <span>{platform.owned ? 'Owned' : 'Optional board theme'}</span>
          {platform.theme === 'sunset' && <Check size={18} />}
        </button>
      </div>
      {!platform.owned && platform.product && (
        <button
          className="play-button modal-primary"
          disabled={platform.busy || !platform.identity}
          onClick={() => void platform.buy()}
        >
          <Palette size={18} />
          {platform.busy ? 'Confirming…' : `Unlock Sunset · ₦${platform.product.price}`}
        </button>
      )}
      {!platform.identity && <p>Open WordPadi inside LagosLife to unlock and restore themes.</p>}
      {platform.identity?.mode === 'test' && <p>Sandbox purchase · no real money.</p>}
      {platform.error && (
        <p role="alert" className="friend-error">
          {platform.error}
        </p>
      )}
      {platform.identity && (
        <button
          className="quiet-button modal-help"
          disabled={platform.busy}
          onClick={platform.restore}
        >
          Restore purchases
        </button>
      )}
    </div>
  );
}
