import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';

export class VatarError extends Error {}
const id = z.string().min(1).max(160);
export const purchaseSchema = z.object({
  id,
  productId: id,
  playerId: id,
  amount: z.number().int().positive(),
  currency: z.literal('NGN'),
  status: z.enum(['paid', 'delivered', 'refunded']),
  mode: z.enum(['test', 'live']),
});
export type Purchase = z.infer<typeof purchaseSchema>;
export const matchSchema = z.object({
  id,
  status: z.enum(['open', 'playing', 'done', 'cancelled', 'void']),
  stake: z.literal(0),
  seats: z.literal(2),
  players: z
    .array(z.object({ playerId: id, name: z.string().min(1).max(80) }))
    .min(1)
    .max(2),
  nonce: z.string().nullable().optional(),
  mode: z.enum(['test', 'live']),
  endsAt: z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === 'number' ? value : Date.parse(value)))
    .refine(Number.isFinite),
  winner: z.string().nullable().optional(),
});
export type VatarMatch = z.infer<typeof matchSchema>;
export class Vatar {
  readonly mode: 'test' | 'live';
  constructor(
    private secret: string,
    private resultsSecret?: string,
    private request: typeof fetch = fetch,
  ) {
    this.mode = secret.startsWith('vtr_test_') ? 'test' : 'live';
  }
  get matchesEnabled(): boolean {
    return !!this.resultsSecret;
  }
  async call(
    path: string,
    body?: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.request(`https://lagoslife.app/api/games/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        body,
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new VatarError('LagosLife is unavailable. Please try again.');
    }
    if (!response.ok)
      throw new VatarError(
        `LagosLife could not confirm this request (${response.status}). Please retry.`,
      );
    try {
      return await response.json();
    } catch {
      throw new VatarError('LagosLife returned an invalid response.');
    }
  }
  async purchase(purchaseId: string): Promise<Purchase> {
    const parsed = purchaseSchema.safeParse(
      await this.call(`/purchases/${encodeURIComponent(purchaseId)}`),
    );
    if (!parsed.success || parsed.data.mode !== this.mode || parsed.data.id !== purchaseId)
      throw new VatarError('The purchase could not be verified.');
    return parsed.data;
  }
  async deliver(purchaseId: string): Promise<void> {
    const parsed = z
      .object({ id, status: z.literal('delivered') })
      .safeParse(await this.call(`/purchases/${encodeURIComponent(purchaseId)}/deliver`, '{}'));
    if (!parsed.success || parsed.data.id !== purchaseId)
      throw new VatarError('Purchase delivery was not confirmed.');
  }
  async match(matchId: string): Promise<VatarMatch> {
    const parsed = matchSchema.safeParse(
      await this.call(`/matches/${encodeURIComponent(matchId)}`),
    );
    if (!parsed.success || parsed.data.id !== matchId || parsed.data.mode !== this.mode)
      throw new VatarError('LagosLife could not verify this friendly match.');
    return parsed.data;
  }
  async result(matchId: string, nonce: string, winner: string): Promise<void> {
    if (!this.resultsSecret) throw new VatarError('Match results are not configured.');
    const path = `/api/games/v1/matches/${encodeURIComponent(matchId)}/result`;
    const body = JSON.stringify({ winner });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const hash = createHash('sha256').update(body).digest('hex');
    const signature =
      'v1=' +
      createHmac('sha256', this.resultsSecret)
        .update(['POST', path, timestamp, nonce, hash].join('\n'))
        .digest('hex');
    const parsed = matchSchema.safeParse(
      await this.call(`/matches/${encodeURIComponent(matchId)}/result`, body, {
        'X-Vatar-Timestamp': timestamp,
        'X-Vatar-Signature': signature,
      }),
    );
    if (
      !parsed.success ||
      parsed.data.id !== matchId ||
      parsed.data.mode !== this.mode ||
      parsed.data.status !== 'done' ||
      parsed.data.winner !== winner
    )
      throw new VatarError('The match result was not confirmed.');
  }
}
