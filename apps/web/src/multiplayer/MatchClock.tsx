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
  compact = false,
}: {
  expiresAt: number;
  waiting?: boolean;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');
  const time = hours ? `${hours}:${minutes}:${remainder}` : `${minutes}:${remainder}`;
  return (
    <span
      className={`match-clock ${seconds <= 300 ? 'urgent' : ''}`}
      title={new Date(expiresAt).toLocaleString()}
      aria-label={
        seconds ? `${waiting ? 'Invite expires in' : 'Match ends in'} ${time}` : 'Match expired'
      }
    >
      <Clock3 size={13} />
      {seconds
        ? compact
          ? time
          : `${waiting ? 'Invite expires in' : 'Match ends in'} ${time}`
        : 'Match expired'}
    </span>
  );
}
