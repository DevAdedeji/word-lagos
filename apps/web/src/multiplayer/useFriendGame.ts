import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import { replySchema, snapshotSchema, type Action, type Snapshot } from '@word-lagos/multiplayer';
import { connectFriendGame, session } from './client';

function rememberedCode(): string | null {
  try {
    return sessionStorage.getItem('word-lagos:friend-code');
  } catch {
    return null;
  }
}
export function useFriendGame() {
  const [code, setCode] = useState<string | null>(rememberedCode);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>(
    'idle',
  );
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const sendingRef = useRef(false);
  const pendingRef = useRef<{
    id: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const rejectPending = useCallback((message: string) => {
    const request = pendingRef.current;
    if (request) {
      clearTimeout(request.timer);
      pendingRef.current = null;
      request.reject(new Error(message));
      setPending(false);
    }
  }, []);
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refresh: ReturnType<typeof setInterval> | undefined;
    let retries = 0;
    let active: Room | null = null;
    async function connect() {
      setStatus('connecting');
      setError('');
      try {
        const room = await connectFriendGame(code!);
        if (cancelled) {
          void room.leave();
          return;
        }
        active = room;
        roomRef.current = room;
        room.onMessage('snapshot', (input: unknown) => {
          const parsed = snapshotSchema.safeParse(input);
          if (!parsed.success) {
            setError('Received an incompatible game update. Reconnect to retry.');
            return;
          }
          setSnapshot((current) =>
            current && current.code === parsed.data.code && current.revision > parsed.data.revision
              ? current
              : parsed.data,
          );
          setStatus('connected');
          setError('');
          retries = 0;
        });
        room.onMessage('reply', (input: unknown) => {
          const reply = replySchema.safeParse(input);
          const request = pendingRef.current;
          if (!reply.success || !request || request.id !== reply.data.id) return;
          clearTimeout(request.timer);
          pendingRef.current = null;
          setPending(false);
          if (reply.data.ok) request.resolve();
          else request.reject(new Error(reply.data.error ?? 'Move rejected.'));
        });
        room.onMessage('problem', (message: unknown) =>
          setError(typeof message === 'string' ? message : 'Connection interrupted.'),
        );
        room.onError(() => {
          setError('Connection interrupted. Reconnect to your saved game.');
        });
        room.onLeave((closeCode) => {
          if (cancelled || active !== room) return;
          roomRef.current = null;
          setStatus('disconnected');
          rejectPending('Connection lost. Reconnect to check whether your move was saved.');
          if (refresh) clearInterval(refresh);
          if (closeCode === 4001) {
            setError('This game is open in another tab. Close it there before reconnecting.');
            return;
          }
          if (retries < 5)
            timer = setTimeout(
              () => {
                retries++;
                void connect();
              },
              Math.min(1000 * 2 ** retries, 15000),
            );
          else setError('Could not reconnect. Your accepted moves are saved.');
        });
        room.send('ready');
        refresh = setInterval(() => {
          void session()
            .then((token) => {
              if (!cancelled) room.send('renew', token);
            })
            .catch(() =>
              setError('Could not refresh your session. Reconnect before your next move.'),
            );
        }, 10 * 60000);
      } catch (cause) {
        if (cancelled) return;
        setStatus('disconnected');
        setError(cause instanceof Error ? cause.message : 'Could not join this game.');
        if (retries < 5)
          timer = setTimeout(
            () => {
              retries++;
              void connect();
            },
            Math.min(1000 * 2 ** retries, 15000),
          );
      }
    }
    void connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (refresh) clearInterval(refresh);
      roomRef.current = null;
      rejectPending('You left the connection. Accepted moves remain saved.');
      if (active) void active.leave();
    };
  }, [code, attempt, rejectPending]);
  async function send(action: Action): Promise<void> {
    if (!roomRef.current || status !== 'connected' || !snapshot || sendingRef.current)
      throw new Error('Wait until your game is connected.');
    const room = roomRef.current;
    sendingRef.current = true;
    setPending(true);
    try {
      const token = await session();
      if (room !== roomRef.current) throw new Error('Your connection changed. Please try again.');
      room.send('renew', token);
      await new Promise<void>((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
          rejectPending(
            'The server did not confirm your move. Reconnect to check the saved board.',
          );
          setStatus('disconnected');
          setError('Your move has not been confirmed. Reconnect before playing again.');
        }, 15000);
        pendingRef.current = { id, resolve, reject, timer };
        room.send('action', { id, revision: snapshot.revision, action });
      });
    } finally {
      sendingRef.current = false;
      setPending(false);
    }
  }
  function join(nextCode: string) {
    setSnapshot(null);
    setError('');
    setCode(nextCode);
    setAttempt((a) => a + 1);
    try {
      sessionStorage.setItem('word-lagos:friend-code', nextCode);
    } catch {
      setError('This browser cannot remember your game code. Keep the code to reconnect.');
    }
  }
  function leave() {
    setCode(null);
    setSnapshot(null);
    setError('');
    setStatus('idle');
    try {
      sessionStorage.removeItem('word-lagos:friend-code');
    } catch {
      /* The active connection is still closed. */
    }
  }
  return {
    code,
    snapshot,
    status,
    error,
    pending,
    send,
    join,
    leave,
    reconnect: () => setAttempt((a) => a + 1),
  };
}
