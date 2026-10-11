import type { Store } from './store';
import { Vatar, VatarError } from './vatar';

export const themeProduct = { id: 'sunset_board', name: 'Sunset board', price: 100 };
export class Purchases {
  constructor(
    private store: Store,
    private provider: Vatar,
  ) {}
  async claim(playerId: string, purchaseId: string): Promise<void> {
    const purchase = await this.provider.purchase(purchaseId);
    if (
      purchase.playerId !== playerId ||
      purchase.productId !== themeProduct.id ||
      purchase.amount !== themeProduct.price
    )
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
    for (const row of await this.store.ownedPurchases(playerId, this.provider.mode)) {
      const purchase = await this.provider.purchase(row.id);
      if (
        purchase.playerId !== playerId ||
        purchase.productId !== themeProduct.id ||
        purchase.amount !== themeProduct.price
      )
        throw new VatarError('Your theme ownership could not be confirmed.');
      if (purchase.status === 'refunded')
        await this.store.revokePurchase(row.id, this.provider.mode);
    }
    return this.store.ownsTheme(playerId, this.provider.mode);
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
