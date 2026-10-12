import { themeCatalog, type ThemeId } from '@word-lagos/multiplayer';
import type { Store } from './store';
import { Vatar, VatarError } from './vatar';

export const themeProducts = themeCatalog
  .filter((t) => t.productId !== null)
  .map((t) => ({ id: t.productId!, name: `${t.name} board`, price: t.price }));
export const themeProduct = themeProducts.find((t) => t.id === 'sunset_board')!;
// Keep purchases made at the original price restorable after the price change.
function validProduct(productId: string, amount: number) {
  const product = themeProducts.find((p) => p.id === productId);
  return (
    !!product && (amount === product.price || (productId === 'sunset_board' && amount === 100))
  );
}
export class Purchases {
  constructor(
    private store: Store,
    private provider: Vatar,
  ) {}
  async claim(playerId: string, purchaseId: string): Promise<void> {
    const purchase = await this.provider.purchase(purchaseId);
    if (purchase.playerId !== playerId || !validProduct(purchase.productId, purchase.amount))
      throw new VatarError('This purchase does not belong to this player or product.');
    if (purchase.status === 'refunded') {
      await this.store.revokePurchase(purchaseId, this.provider.mode);
      throw new VatarError('This purchase was refunded.');
    }
    await this.store.grantPurchase(purchase);
    if (purchase.status !== 'delivered') await this.provider.deliver(purchaseId);
    await this.store.deliveredPurchase(purchaseId, this.provider.mode);
  }
  async owned(playerId: string): Promise<boolean> {
    return (await this.ownedThemes(playerId)).includes('sunset');
  }
  async ownedThemes(playerId: string): Promise<ThemeId[]> {
    for (const row of await this.store.ownedPurchases(playerId, this.provider.mode)) {
      const purchase = await this.provider.purchase(row.id);
      if (purchase.playerId !== playerId || !validProduct(purchase.productId, purchase.amount))
        throw new VatarError('Your theme ownership could not be confirmed.');
      if (purchase.status === 'refunded')
        await this.store.revokePurchase(row.id, this.provider.mode);
    }
    const rows = await this.store.ownedPurchases(playerId, this.provider.mode);
    return themeCatalog
      .filter((t) => rows.some((r) => r.productId === t.productId))
      .map((t) => t.id);
  }
  async retryPending(): Promise<void> {
    for (const purchase of await this.store.pendingPurchases(this.provider.mode)) {
      try {
        await this.claim(purchase.playerId, purchase.id);
      } catch {
        console.warn(
          JSON.stringify({ event: 'purchase_delivery_pending', purchaseId: purchase.id }),
        );
      }
    }
  }
}
