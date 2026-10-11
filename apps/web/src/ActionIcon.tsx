import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type Props = {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** Hover/focus help on desktop, hold-to-read help without activating on touch. */
export default function ActionIcon({ label, disabled, onClick, children }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );
  return (
    <span
      className="rack-icon-action"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(event) => {
        clearHold();
        if (event.pointerType === 'mouse') setOpen(false);
      }}
      onPointerDown={(event) => {
        held.current = false;
        if (event.pointerType === 'mouse') return;
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        holdTimer.current = setTimeout(() => {
          held.current = true;
          setOpen(true);
          dismissTimer.current = setTimeout(() => setOpen(false), 3000);
        }, 450);
      }}
      onPointerUp={clearHold}
      onPointerCancel={() => {
        clearHold();
        held.current = true;
        setOpen(false);
      }}
    >
      <button
        type="button"
        className="rack-icon-button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          setOpen(false);
          onClick();
        }}
      >
        {children}
      </button>
      {open && (
        <span className="rack-action-tooltip" role="tooltip" id={id}>
          <strong>{label}</strong>
        </span>
      )}
    </span>
  );
}
