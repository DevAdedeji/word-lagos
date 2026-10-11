import { Room, ServerError, type Client } from '@colyseus/core';
import { z } from 'zod';
import { codeSchema } from '@word-lagos/multiplayer';
import { Auth, type Identity } from './auth';
import { Matches, MatchError, snapshot } from './matches';

const joinSchema = z.object({ code: codeSchema, session: z.string().min(10).max(4096) });
export function friendRoom(auth: Auth, matches: Matches) {
  return class FriendRoom extends Room {
    maxClients = 4;
    maxMessagesPerSecond = 12;
    private code = '';
    private identities = new Map<string, Identity>();
    private queue: Promise<void> = Promise.resolve();
    async onCreate(options: unknown) {
      const parsed = joinSchema.safeParse(options);
      if (!parsed.success) throw new ServerError(400, 'Enter a valid game code.');
      this.code = parsed.data.code;
      this.roomId = this.code;
      this.autoDispose = false;
      this.clock.setTimeout(() => {
        if (this.clients.length === 0) void this.disconnect();
      }, 60000);
      await auth.verify(parsed.data.session);
      await matches.get(this.code);
      await this.setPrivate(true);
      this.onMessage('ready', (client) =>
        this.enqueue(client, async () => {
          await this.publish();
        }),
      );
      this.onMessage('renew', (client, session: unknown) =>
        this.enqueue(client, async () => {
          const next = await auth.verify(session);
          if (next.id !== this.identities.get(client.sessionId)?.id)
            throw new MatchError('The player session changed. Reopen your game.');
          this.identities.set(client.sessionId, next);
        }),
      );
      this.onMessage('action', (client, input: unknown) =>
        this.enqueue(client, async () => {
          const identity = this.identities.get(client.sessionId);
          const id =
            typeof input === 'object' &&
            input !== null &&
            'id' in input &&
            typeof input.id === 'string'
              ? input.id
              : '';
          try {
            if (!identity || identity.expiresAt <= Date.now())
              throw new MatchError('Your session expired. Reconnect and try again.');
            await matches.act(this.code, identity.id, input);
            await this.publish();
            client.send('reply', { id, ok: true });
          } catch (error) {
            if (!(error instanceof MatchError))
              console.error(JSON.stringify({ event: 'match_write_failed', code: this.code }));
            client.send('reply', {
              id,
              ok: false,
              error:
                error instanceof MatchError
                  ? error.message
                  : 'The move could not be saved. Reconnect before trying again.',
            });
            await this.publish();
          }
        }),
      );
    }
    async onAuth(_client: Client, options: unknown) {
      const parsed = joinSchema.safeParse(options);
      if (!parsed.success || parsed.data.code !== this.code)
        throw new ServerError(403, 'This game could not be joined.');
      const identity = await auth.verify(parsed.data.session);
      await matches.join(this.code, identity);
      return identity;
    }
    async onJoin(client: Client, _options: unknown, identity: Identity) {
      // A reconnect replaces this player's older socket without freeing their seat.
      for (const other of this.clients) {
        if (
          other.sessionId !== client.sessionId &&
          this.identities.get(other.sessionId)?.id === identity.id
        ) {
          this.identities.delete(other.sessionId);
          other.leave(4001, 'This game was opened in another tab.');
        }
      }
      this.identities.set(client.sessionId, identity);
      await this.publish();
    }
    async onLeave(client: Client) {
      this.identities.delete(client.sessionId);
      await this.publish();
      if (this.clients.length === 0)
        this.clock.setTimeout(() => {
          if (this.clients.length === 0) void this.disconnect();
        }, 60000);
    }
    private enqueue(client: Client, job: () => Promise<void>) {
      this.queue = this.queue
        .then(job)
        .catch(() =>
          client.send('problem', 'Connection interrupted. Reconnect to your saved game.'),
        );
    }
    private async publish() {
      const match = await matches.get(this.code);
      const online = new Set([...this.identities.values()].map((p) => p.id));
      for (const client of this.clients) {
        const identity = this.identities.get(client.sessionId);
        if (identity && identity.expiresAt <= Date.now()) {
          client.leave(4003, 'Your session expired. Reconnect.');
          continue;
        }
        if (identity) client.send('snapshot', snapshot(match, identity.id, online));
      }
    }
  };
}
