import { useRef, useState } from 'react';
import { Check, ArrowRight, Eye, LockKeyhole, Sparkles, X } from 'lucide-react';
import { themeCatalog, type ThemeId } from '@word-lagos/multiplayer';
import { premiumAt } from '@word-lagos/game-core';
import type { usePlatform } from './usePlatform';

export function ThemeBoard({ theme, small = false }: { theme: ThemeId; small?: boolean }) {
  return (
    <div className={`theme-art theme-${theme} ${small ? 'small' : ''}`} aria-hidden="true">
      <div className="theme-art-board">
        {Array.from({ length: 225 }, (_, i) => {
          const row = Math.floor(i / 15),
            col = i % 15;
          const letter = row === 7 && col >= 5 && col <= 9 ? 'WORDS'[col - 5] : '';
          return (
            <span
              key={i}
              className={`art-square art-${premiumAt(row, col) || 'normal'} ${letter ? 'art-tile' : ''}`}
            >
              {letter || (!small && premiumAt(row, col))}
            </span>
          );
        })}
      </div>
      {!small && (
        <div className="theme-art-rack">
          {[...'WORDPADI'].slice(0, 7).map((letter, i) => (
            <span key={i}>
              {letter}
              <small>{letter === 'W' ? 4 : 1}</small>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
export default function BoardThemes({
  platform,
  onPreview,
}: {
  platform: ReturnType<typeof usePlatform>;
  onPreview: () => void;
}) {
  const [selected, setSelected] = useState<ThemeId>(platform.previewTheme ?? platform.theme);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const theme = themeCatalog.find((t) => t.id === selected)!;
  const owned = selected === 'classic' || platform.ownedThemes.includes(selected);
  const available = platform.demo || platform.products.some((p) => p.id === theme.productId);
  return (
    <div className="theme-shop">
      <div className="shop-heading">
        <div className="eyebrow">THE WORDPADI COLLECTION</div>
        <h2 id="dialog-title">Find your kind of table.</h2>
        <p>Same clever game. A little more you.</p>
      </div>
      <div className="shop-scroll" ref={scrollRef}>
        <div className={`theme-hero theme-${selected}`}>
          <div className="theme-hero-caption">
            <span>{theme.subtitle}</span>
            <span className="theme-price">
              {owned ? (
                <>
                  <Check size={12} /> Yours
                </>
              ) : (
                '₦500 · once'
              )}
            </span>
          </div>
          <ThemeBoard theme={selected} />
          <div className="theme-hero-title">
            <h3>{theme.name}</h3>
            <span>{selected === 'classic' ? 'THE ORIGINAL' : 'BOARD + TILES + RACK'}</span>
          </div>
        </div>
        <p className="theme-description">{theme.description}</p>
        <div className="theme-gallery" role="group" aria-label="Choose a board theme">
          {themeCatalog.map((t) => (
            <button
              key={t.id}
              className={`theme-choice ${selected === t.id ? 'selected' : ''}`}
              aria-pressed={selected === t.id}
              onClick={() => {
                setSelected(t.id);
                scrollRef.current?.scrollTo({ top: 0 });
                setConfirmDemo(false);
              }}
            >
              <ThemeBoard theme={t.id} small />
              <span>{t.name}</span>
              <small>
                {t.id === 'classic'
                  ? 'Free'
                  : platform.ownedThemes.includes(t.id)
                    ? 'Owned'
                    : '₦500'}
              </small>
            </button>
          ))}
        </div>
        <div className="shop-promise">
          <Sparkles size={15} />
          <span>Just a new look. Bonus squares, rules and scores stay the same.</span>
        </div>
        {platform.error && (
          <p role="alert" className="friend-error">
            {platform.error}
          </p>
        )}
        {platform.identity && (
          <button
            className="quiet-button shop-restore"
            disabled={platform.busy}
            onClick={platform.restore}
          >
            Restore purchases
          </button>
        )}
      </div>
      <div className="shop-footer">
        <button
          className="theme-preview-button"
          onClick={() => {
            platform.preview(selected);
            onPreview();
          }}
        >
          <Eye size={17} /> Try on board
        </button>
        <button
          className="play-button modal-primary"
          disabled={platform.busy || (!owned && !available)}
          onClick={() =>
            owned
              ? platform.chooseTheme(selected)
              : platform.demo
                ? setConfirmDemo(true)
                : void platform.buy(selected)
          }
        >
          {platform.busy ? (
            'Confirming…'
          ) : owned ? (
            platform.theme === selected ? (
              <>
                <Check size={17} /> In use
              </>
            ) : (
              <>
                Use theme <ArrowRight size={17} />
              </>
            )
          ) : (
            <>
              <LockKeyhole size={16} /> Unlock · ₦500
            </>
          )}
        </button>
        <small>
          {platform.demo
            ? 'Local preview · purchases are simulated'
            : platform.identity?.mode === 'test'
              ? 'Sandbox purchase · no real money.'
              : !platform.identity
                ? 'Preview any theme. Open in LagosLife to purchase.'
                : 'One-time purchase in real naira. Yours to keep.'}
        </small>
      </div>
      {confirmDemo && (
        <div className="demo-checkout" role="group" aria-label="Simulated checkout">
          <button
            className="demo-close"
            aria-label="Cancel simulated checkout"
            onClick={() => setConfirmDemo(false)}
          >
            <X size={19} />
          </button>
          <div className="eyebrow">LOCAL DEMO · NO CHARGE</div>
          <h3>Make {theme.name} yours.</h3>
          <p>
            In LagosLife, its secure checkout confirms your ₦500 one-time purchase. Your server
            verifies it before unlocking the theme.
          </p>
          <button
            className="play-button modal-primary"
            onClick={() => {
              void platform.buy(selected);
              setConfirmDemo(false);
            }}
          >
            Simulate unlock <ArrowRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
