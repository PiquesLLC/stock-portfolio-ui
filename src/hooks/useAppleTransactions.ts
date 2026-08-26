import { useEffect, useRef } from 'react';
import {
  isIAPAvailable,
  startAppleTransactionListeners,
  stopAppleTransactionListeners,
} from '../utils/iap';

/**
 * Registers the StoreKit transaction listeners once for the authenticated app
 * lifecycle, on native iOS only.
 *
 * This is the crash-recovery path: StoreKit charges the customer, the app dies
 * before our verify call lands, and on the next launch Apple redelivers the
 * transaction. Without this, that purchase is only recoverable by the user
 * finding "Restore Purchases" themselves.
 *
 * The callback is held in a ref on purpose. If it were an effect dependency,
 * every identity change would tear the native listener down and re-register it,
 * which is exactly the "registered more than once" bug this must not have.
 */
export function useAppleTransactions(
  isAuthenticated: boolean,
  onBackendAccepted: () => void,
): void {
  const callbackRef = useRef(onBackendAccepted);
  callbackRef.current = onBackendAccepted;

  useEffect(() => {
    if (!isAuthenticated || !isIAPAvailable()) return;

    let active = true;
    void startAppleTransactionListeners(() => {
      if (active) callbackRef.current();
    });

    return () => {
      active = false;
      void stopAppleTransactionListeners();
    };
  }, [isAuthenticated]);
}
