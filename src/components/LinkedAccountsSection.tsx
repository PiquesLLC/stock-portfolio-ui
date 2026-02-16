import { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { createPlaidLinkToken, exchangePlaidToken, getPlaidItems, disconnectPlaidItem, PlaidItem, PlaidSyncResult } from '../api';
import { useToast } from '../context/ToastContext';

export function LinkedAccountsSection() {
  const [items, setItems] = useState<PlaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<PlaidSyncResult | null>(null);
  const { showToast } = useToast();

  const fetchItems = useCallback(async () => {
    try {
      const { items: fetched } = await getPlaidItems();
      setItems(fetched);
    } catch {
      // silent — items section is optional
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Create link token when user wants to connect
  const handleStartLink = async () => {
    setLinking(true);
    try {
      const { linkToken: token } = await createPlaidLinkToken();
      setLinkToken(token);
    } catch {
      showToast('Failed to start account linking', 'error');
      setLinking(false);
    }
  };

  const handleDisconnect = async (itemId: string) => {
    setDisconnecting(itemId);
    try {
      await disconnectPlaidItem(itemId);
      showToast('Account disconnected', 'success');
      fetchItems();
    } catch {
      showToast('Failed to disconnect account', 'error');
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
        Linked Accounts
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-rh-green border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Existing linked accounts */}
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-rh-border/20 border border-gray-200/50 dark:border-rh-border/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-rh-green/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-rh-light-text dark:text-rh-text truncate">
                    {item.institutionName || 'Unknown Institution'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      item.status === 'active'
                        ? 'bg-rh-green/10 text-rh-green'
                        : item.status === 'error'
                        ? 'bg-rh-red/10 text-rh-red'
                        : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                    }`}>
                      {item.status}
                    </span>
                    <span className="text-xs text-rh-light-muted dark:text-rh-muted">
                      {item.plaidAccounts.length} account{item.plaidAccounts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {item.plaidAccounts.length > 0 && (
                    <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 mt-0.5">
                      {item.plaidAccounts.map(a => `${a.name || a.type || 'Account'}${a.mask ? ` ••${a.mask}` : ''}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDisconnect(item.id)}
                disabled={disconnecting === item.id}
                className="text-xs text-rh-red hover:text-red-400 font-medium px-2 py-1 rounded
                  hover:bg-rh-red/10 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {disconnecting === item.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}

          {/* Connect button */}
          {linkToken ? (
            <PlaidLinkButton
              linkToken={linkToken}
              onSuccess={async (publicToken) => {
                try {
                  const result = await exchangePlaidToken(publicToken);
                  const sync = result.sync;
                  if (sync && sync.created > 0) {
                    showToast(`Imported ${sync.created} holding${sync.created !== 1 ? 's' : ''}!`, 'success');
                  } else {
                    showToast('Account linked successfully!', 'success');
                  }
                  if (sync && sync.skippedDetails.length > 0) {
                    setLastSync(sync);
                  }
                  setLinkToken(null);
                  setLinking(false);
                  fetchItems();
                } catch {
                  showToast('Failed to link account', 'error');
                  setLinking(false);
                }
              }}
              onExit={() => {
                setLinkToken(null);
                setLinking(false);
              }}
            />
          ) : (
            <button
              onClick={handleStartLink}
              disabled={linking}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left
                bg-gray-100 dark:bg-rh-border text-rh-light-text dark:text-rh-text
                hover:bg-gray-200 dark:hover:bg-rh-border/80 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>{linking ? 'Connecting...' : 'Connect Brokerage Account'}</span>
              </div>
            </button>
          )}

          {/* Skipped holdings notice */}
          {lastSync && lastSync.skippedDetails.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200/60 dark:border-yellow-700/30">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300 mb-1">
                    {lastSync.skippedDetails.length} holding{lastSync.skippedDetails.length !== 1 ? 's' : ''} not imported
                  </p>
                  <ul className="space-y-0.5">
                    {lastSync.skippedDetails.map((item, i) => (
                      <li key={i} className="text-xs text-yellow-700 dark:text-yellow-400/80">
                        <span className="font-medium">{item.ticker || item.name || 'Unknown'}</span>
                        {' — '}
                        {item.reason}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setLastSync(null)}
                    className="text-xs text-yellow-600 dark:text-yellow-400 hover:underline mt-1.5"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-rh-light-muted/60 dark:text-rh-muted/60 px-1">
            Securely link your brokerage via Plaid. We never see your login credentials.
          </p>
        </div>
      )}
    </section>
  );
}

/** Wrapper that auto-opens Plaid Link when the token is ready */
function PlaidLinkButton({ linkToken, onSuccess, onExit }: {
  linkToken: string;
  onSuccess: (publicToken: string) => void;
  onExit: () => void;
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => onSuccess(public_token),
    onExit: () => onExit(),
  });

  useEffect(() => {
    if (ready) open();
  }, [ready, open]);

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold
        bg-rh-green text-black hover:bg-green-400
        disabled:opacity-50 disabled:cursor-not-allowed transition-colors
        flex items-center justify-center gap-2"
    >
      <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent" />
      Opening Plaid Link...
    </button>
  );
}
