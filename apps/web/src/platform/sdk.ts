import { z } from 'zod';

const playerSchema = z.object({ id: z.string(), name: z.string(), avatar: z.string().nullable() });
const initSchema = z.object({
  player: playerSchema,
  session: z.string(),
  mode: z.enum(['test', 'live']),
});
export const platformMatchSchema = z.object({
  id: z.string().min(1).max(160),
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  status: z.enum(['open', 'playing', 'done', 'cancelled', 'void']),
  mode: z.enum(['test', 'live']),
});
export type PlatformMatch = z.infer<typeof platformMatchSchema>;
export type PlatformIdentity = z.infer<typeof initSchema>;
export interface VatarSDK {
  init(): Promise<unknown>;
  session(): Promise<{ session: string; exp: number }>;
  onPause(fn: () => void): () => void;
  onResume(fn: () => void): () => void;
  purchase(productId: string): Promise<{ purchaseId: string; productId: string }>;
  purchases(): Promise<{ purchaseId: string; productId: string }[]>;
  onPurchase(fn: (purchase: { purchaseId: string; productId: string }) => void): () => void;
  match: {
    create(options: { stake: number; seats: number }): Promise<unknown>;
    join(code: string): Promise<unknown>;
    current(): Promise<unknown>;
    onUpdate(fn: (match: unknown) => void): () => void;
  };
}
declare global {
  interface Window {
    Vatar?: VatarSDK;
  }
}
let ready: Promise<PlatformIdentity> | undefined;
export function initializeVatar(): Promise<PlatformIdentity> {
  if (!ready)
    ready = (async () => {
      if (!window.Vatar)
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://lagoslife.app/sdk/vatar-games-v1.js';
          const fail = () => {
            script.remove();
            window.clearTimeout(timer);
            reject(new Error('Could not connect to LagosLife. Reopen the game to retry.'));
          };
          const timer = window.setTimeout(fail, 15000);
          script.onload = () => {
            window.clearTimeout(timer);
            resolve();
          };
          script.onerror = fail;
          document.head.append(script);
        });
      if (!window.Vatar) throw new Error('LagosLife is unavailable.');
      return initSchema.parse(await window.Vatar.init());
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
export async function vatar(): Promise<VatarSDK> {
  await initializeVatar();
  return window.Vatar!;
}
