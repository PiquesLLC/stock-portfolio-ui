import type { Product, Transaction } from '@capgo/native-purchases';
import { isNative, platform } from './platform';
import { API_BASE_URL } from '../config';

/**
 * In-App Purchase utilities for iOS StoreKit 2.
 * Uses @capgo/native-purchases for native StoreKit integration.
 * All functions are no-ops on web — web uses Stripe via PricingPage.
 */

// Lazy-load the plugin module to avoid bundling native code in the web build.
// Types are imported separately above (type-only imports erase at compile time).
async function getIAPPlugin() {
  const mod = await import('@capgo/native-purchases');
  return { NativePurchases: mod.NativePurchases, PURCHASE_TYPE: mod.PURCHASE_TYPE };
}

// Product IDs matching App Store Connect configuration
export const PRODUCT_IDS = [
  'nala_pro_monthly',
  'nala_pro_yearly',
  'nala_premium_monthly',
  'nala_premium_yearly',
  'nala_elite_monthly',
  'nala_elite_yearly',
];

export interface IAPProduct {
  id: string;
  title: string;
  description: string;
  price: string;            // Localized price string (e.g., "$9.99")
  priceAmount: number;      // Numeric price
  currencyCode: string;
  plan: 'pro' | 'premium' | 'elite';
  period: 'monthly' | 'yearly';
}

/**
 * Check if IAP is available (native iOS only).
 */
export function isIAPAvailable(): boolean {
  return isNative && platform === 'ios';
}

/**
 * Initialize IAP and load available products from the App Store.
 */
export async function getProducts(): Promise<IAPProduct[]> {
  if (!isIAPAvailable()) return [];

  try {
    const { NativePurchases, PURCHASE_TYPE } = await getIAPPlugin();
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: PRODUCT_IDS,
      productType: PURCHASE_TYPE.SUBS,
    });

    return products.map((p: Product) => {
      const id = p.identifier;
      const parts = id.split('_'); // e.g., 'nala_pro_monthly' -> ['nala', 'pro', 'monthly']
      return {
        id,
        title: p.title || id,
        description: p.description || '',
        price: p.priceString || `$${p.price}`,
        priceAmount: typeof p.price === 'number' ? p.price : parseFloat(String(p.price)) || 0,
        currencyCode: p.currencyCode || 'USD',
        plan: parts[1] as 'pro' | 'premium' | 'elite',
        period: parts[2] as 'monthly' | 'yearly',
      };
    });
  } catch (err) {
    console.error('[IAP] Failed to load products:', err);
    return [];
  }
}

/**
 * Purchase a product and verify the transaction with the server.
 * Returns the activated plan on success.
 */
export async function purchaseProduct(
  productId: string,
  userId?: string,
): Promise<{ ok: boolean; plan?: string; error?: string }> {
  if (!isIAPAvailable()) {
    return { ok: false, error: 'IAP not available on this platform' };
  }

  try {
    const { NativePurchases, PURCHASE_TYPE } = await getIAPPlugin();

    // Trigger Apple payment sheet
    const transaction: Transaction = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: PURCHASE_TYPE.SUBS,
      appAccountToken: userId, // Links purchase to Nala user
    });

    // Get the JWS signed transaction for server verification
    const signedTransaction = transaction.jwsRepresentation;
    if (!signedTransaction) {
      return { ok: false, error: 'No JWS transaction received from StoreKit' };
    }

    // Verify with our server
    return await syncTransactionWithServer(signedTransaction);
  } catch (err: any) {
    // User cancelled purchase
    if (err?.code === 'USER_CANCELLED' || err?.message?.includes('cancel')) {
      return { ok: false, error: 'cancelled' };
    }
    console.error('[IAP] Purchase failed:', err);
    return { ok: false, error: err?.message || 'Purchase failed' };
  }
}

/**
 * Send a JWS signed transaction to the server for verification and plan activation.
 */
async function syncTransactionWithServer(
  signedTransaction: string,
): Promise<{ ok: boolean; plan?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/billing/apple-verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Nala-Native': '1' },
      body: JSON.stringify({ signedTransaction }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || 'Verification failed' };
    }

    return { ok: true, plan: data.plan };
  } catch (err: any) {
    console.error('[IAP] Server verification failed:', err);
    return { ok: false, error: 'Failed to verify purchase with server' };
  }
}

/**
 * Restore previous purchases (required by Apple).
 * Fetches all historical transactions and verifies with server.
 */
export async function restorePurchases(): Promise<{ ok: boolean; plan?: string; message?: string }> {
  if (!isIAPAvailable()) {
    return { ok: false, message: 'IAP not available on this platform' };
  }

  try {
    const { NativePurchases } = await getIAPPlugin();
    await NativePurchases.restorePurchases();

    // After restore, the listener will handle the transactions
    // For now, tell the server to check
    const res = await fetch(`${API_BASE_URL}/billing/apple-restore`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Nala-Native': '1' },
      body: JSON.stringify({ signedTransactions: [] }), // Server checks Apple's records
    });

    const data = await res.json();
    if (data.ok && data.plan) {
      return { ok: true, plan: data.plan };
    }
    return { ok: false, message: data.message || 'No active subscription found' };
  } catch (err: any) {
    console.error('[IAP] Restore failed:', err);
    return { ok: false, message: err?.message || 'Restore failed' };
  }
}
