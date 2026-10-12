import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
export function useExpired(expiresAt?: number) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!expiresAt) {
      setExpired(false);
      return;
    }
    setExpired(expiresAt <= Date.now());
    const timer = setTimeout(() => setExpired(true), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return expired;
}
export default function MatchClock({
  expiresAt,
  waiting = false,
}: {
  expiresAt: number;
  waiting?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const time =
    seconds >= 86400
      ? `${Math.ceil(seconds / 86400)}d`
      : seconds >= 3600
        ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <span
      className={`match-clock ${seconds <= 300 ? 'urgent' : ''}`}
      title={new Date(expiresAt).toLocaleString()}
    >
      <Clock3 size={13} />
      {seconds ? `${waiting ? 'Invite expires in' : 'Match ends in'} ${time}` : 'Match expired'}
    </span>
  );
}
