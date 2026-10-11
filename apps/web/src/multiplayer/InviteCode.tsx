import { useEffect, useRef, useState } from 'react';

export default function InviteCode({ code }: { code: string }) {
  const codeRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (status !== 'copied') return;
    const timer = window.setTimeout(() => setStatus('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);
  return (
    <button
      className="friend-connection invite-banner"
      aria-label={`Copy invite code ${code}`}
      title="Copy invite code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setStatus('copied');
        } catch {
          setStatus('failed');
          if (codeRef.current) {
            const range = document.createRange();
            range.selectNodeContents(codeRef.current);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }}
    >
      <span className="invite-banner-label">
        <strong>Invite your friend</strong>
        <span aria-live="polite">
          {status === 'copied'
            ? 'Copied! Send it to your padi'
            : status === 'failed'
              ? 'Select and copy the code'
              : 'Tap to copy your invite code'}
        </span>
      </span>
      <b ref={codeRef} className="invite-code">
        {code}
      </b>
    </button>
  );
}
