import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Player, Store } from './store';

export type AuthMode = 'local' | 'vatar' | 'disabled';
export type Identity = Player & { expiresAt: number };
export class AuthError extends Error {}
const verifiedSchema = z.object({
  playerId: z.string().min(1).max(160),
  name: z.string().min(1).max(80),
  gameId: z.string().min(1),
  exp: z.number(),
  mode: z.enum(['test', 'live']),
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class Auth {
  constructor(
    readonly mode: AuthMode,
    private store: Store,
    private secret?: string,
    private gameId?: string,
    private request: typeof fetch = fetch,
  ) {}
  async issueLocal(): Promise<{ token: string; name: string }> {
    if (this.mode !== 'local') throw new AuthError('Local players are disabled.');
    const token = `local.${randomBytes(32).toString('base64url')}`;
    const id = `local_${randomBytes(16).toString('hex')}`;
    const player = { id, name: `Player ${id.slice(-4).toUpperCase()}` };
    await this.store.addSession(hash(token), player);
    return { token, name: player.name };
  }
  async verify(token: unknown): Promise<Identity> {
    if (typeof token !== 'string' || token.length < 10 || token.length > 4096)
      throw new AuthError('Your player session is missing. Reconnect to try again.');
    if (this.mode === 'local') {
      const player = await this.store.session(hash(token));
      if (!player) throw new AuthError('This local session expired. Open a new player session.');
      return { ...player, expiresAt: Date.now() + 15 * 60000 };
    }
    if (this.mode !== 'vatar' || !this.secret)
      throw new AuthError('Friend matches will be available after LagosLife is connected.');
    // The provider verifies game ownership using our game-scoped secret.
    // An explicitly configured game ID adds an optional consistency check.
    let response: Response;
    try {
      response = await this.request('https://lagoslife.app/api/games/v1/session/verify', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: token }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new AuthError('LagosLife could not verify your session. Please reconnect.');
    }
    if (!response.ok)
      throw new AuthError(
        'Your LagosLife session expired or is invalid. Reopen the game in LagosLife.',
      );
    const parsed = verifiedSchema.safeParse(await response.json());
    const expectedMode = this.secret.startsWith('vtr_test_') ? 'test' : 'live';
    if (
      !parsed.success ||
      parsed.data.exp <= Date.now() ||
      (this.gameId && parsed.data.gameId !== this.gameId) ||
      parsed.data.mode !== expectedMode
    )
      throw new AuthError('LagosLife returned an invalid player session.');
    return { id: parsed.data.playerId, name: parsed.data.name, expiresAt: parsed.data.exp };
  }
}
