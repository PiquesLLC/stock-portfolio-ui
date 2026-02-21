import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  getCreatorProfile,
  updateCreatorSettings,
  createCreatorConnectOnboarding,
} from '../api';
import { CreatorProfile, CreatorSettingsUpdate } from '../types';

interface CreatorSettingsPageProps {
  userId: string;
  onBack: () => void;
}

const PRICING_TEMPLATES = [
  { cents: 499, label: '$4.99/mo' },
  { cents: 999, label: '$9.99/mo' },
  { cents: 1499, label: '$14.99/mo' },
];

const DELAY_OPTIONS: { hours: 0 | 24 | 48 | 72; label: string }[] = [
  { hours: 0, label: 'None' },
  { hours: 24, label: '24 hours' },
  { hours: 48, label: '48 hours' },
  { hours: 72, label: '72 hours' },
];

function Toggle({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      <span className="text-sm text-rh-light-text dark:text-rh-text">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          enabled ? 'bg-rh-green' : 'bg-gray-300 dark:bg-white/20'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          enabled ? 'translate-x-4' : ''
        }`} />
      </button>
    </label>
  );
}

export function CreatorSettingsPage({ userId, onBack }: CreatorSettingsPageProps) {
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connectLoading, setConnectLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [pricing, setPricing] = useState<number>(499);
  const [customPricing, setCustomPricing] = useState(false);
  const [customDollars, setCustomDollars] = useState('');
  const [pitch, setPitch] = useState('');
  const [showHoldings, setShowHoldings] = useState(true);
  const [showTradeHistory, setShowTradeHistory] = useState(false);
  const [showRationale, setShowRationale] = useState(false);
  const [showSectors, setShowSectors] = useState(true);
  const [showRiskMetrics, setShowRiskMetrics] = useState(false);
  const [showWatchlists, setShowWatchlists] = useState(false);
  const [tradeDelayHours, setTradeDelayHours] = useState<0 | 24 | 48 | 72>(0);
  const [hideShareCount, setHideShareCount] = useState(false);

  const loadCreator = useCallback(async () => {
    try {
      const profile = await getCreatorProfile(userId);
      setCreator(profile);
      // Populate form
      setPricing(profile.pricingCents);
      setPitch(profile.pitch || '');
      setShowHoldings(profile.visibility.showHoldings);
      setShowTradeHistory(profile.visibility.showTradeHistory);
      setShowRationale(profile.visibility.showRationale);
      setShowSectors(profile.visibility.showSectors);
      setShowRiskMetrics(profile.visibility.showRiskMetrics);
      setShowWatchlists(profile.visibility.showWatchlists);
      setTradeDelayHours(profile.visibility.tradeDelayHours as 0 | 24 | 48 | 72);
      setHideShareCount(profile.visibility.hideShareCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load creator settings');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadCreator(); }, [loadCreator]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const settings: CreatorSettingsUpdate = {
        pricingCents: pricing,
        pitch: pitch.trim() || undefined,
        showHoldings,
        showTradeHistory,
        showRationale,
        showSectors,
        showRiskMetrics,
        showWatchlists,
        tradeDelayHours,
        hideShareCount,
      };
      const updated = await updateCreatorSettings(settings);
      setCreator(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectOnboarding = async () => {
    setConnectLoading(true);
    try {
      const { url } = await createCreatorConnectOnboarding();
      window.open(url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Stripe onboarding');
    } finally {
      setConnectLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-gray-200 dark:bg-white/10 rounded" />
          <div className="h-40 bg-gray-200 dark:bg-white/10 rounded-xl" />
          <div className="h-40 bg-gray-200 dark:bg-white/10 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-sm text-rh-light-muted dark:text-rh-muted">Creator profile not found.</p>
        <button onClick={onBack} className="mt-3 text-sm text-rh-green hover:underline">Go back</button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto px-4 py-6 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors">
          <svg className="w-5 h-5 text-rh-light-text dark:text-rh-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-rh-light-text dark:text-rh-text">Creator Settings</h1>
        {creator.status === 'pending' && (
          <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-yellow-500/15 text-yellow-600 dark:text-yellow-400">
            Pending Approval
          </span>
        )}
      </div>

      {/* Stripe Connect */}
      <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
        bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
          Payouts
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-rh-light-text dark:text-rh-text">Stripe Connect</p>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">
              {creator.stripeConnectOnboarded ? 'Connected — payouts enabled' : 'Connect to receive payouts'}
            </p>
          </div>
          <button
            onClick={handleConnectOnboarding}
            disabled={connectLoading}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              creator.stripeConnectOnboarded
                ? 'bg-gray-100 dark:bg-white/[0.08] text-rh-light-text dark:text-rh-text hover:bg-gray-200 dark:hover:bg-white/[0.12]'
                : 'bg-rh-green/80 text-white hover:bg-rh-green/70'
            } disabled:opacity-50`}
          >
            {connectLoading ? '...' : creator.stripeConnectOnboarded ? 'Manage' : 'Connect'}
          </button>
        </div>
      </section>

      {/* Pricing */}
      <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
        bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
          Pricing
        </h2>
        <div className="flex gap-2 mb-3">
          {PRICING_TEMPLATES.map(opt => (
            <button
              key={opt.cents}
              onClick={() => { setPricing(opt.cents); setCustomPricing(false); setCustomDollars(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                pricing === opt.cents && !customPricing
                  ? 'border-rh-green bg-rh-green/10 text-rh-green'
                  : 'border-gray-200 dark:border-white/[0.1] text-rh-light-muted dark:text-rh-muted hover:border-gray-300 dark:hover:border-white/20'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => { setCustomPricing(true); setCustomDollars((pricing / 100).toFixed(2)); }}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
              customPricing
                ? 'border-rh-green bg-rh-green/10 text-rh-green'
                : 'border-gray-200 dark:border-white/[0.1] text-rh-light-muted dark:text-rh-muted hover:border-gray-300 dark:hover:border-white/20'
            }`}
          >
            Edit
          </button>
        </div>
        {customPricing && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-rh-light-text dark:text-rh-text">$</span>
            <input
              type="number"
              min="1.00"
              max="999.99"
              step="0.01"
              value={customDollars}
              onChange={(e) => {
                setCustomDollars(e.target.value);
                const cents = Math.round(parseFloat(e.target.value) * 100);
                if (cents >= 100 && cents <= 99999) setPricing(cents);
              }}
              className="w-28 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.1]
                bg-white dark:bg-white/[0.04] text-sm text-rh-light-text dark:text-rh-text
                focus:outline-none focus:ring-2 focus:ring-rh-green/50"
              placeholder="1.00"
            />
            <span className="text-xs text-rh-light-muted dark:text-rh-muted">/month</span>
            {(parseFloat(customDollars) < 1 && customDollars !== '') && (
              <span className="text-xs text-red-500">Min $1.00</span>
            )}
          </div>
        )}
        <p className="mt-2 text-[10px] text-rh-light-muted dark:text-rh-muted">
          Current: ${(pricing / 100).toFixed(2)}/mo — subscribers pay this monthly for access to your locked content.
        </p>
      </section>

      {/* Content Visibility */}
      <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
        bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">
          Locked Content
        </h2>
        <p className="text-xs text-rh-light-muted dark:text-rh-muted mb-3">
          Choose which sections subscribers can access.
        </p>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
          <Toggle label="Holdings" enabled={showHoldings} onChange={setShowHoldings} />
          <Toggle label="Trade History" enabled={showTradeHistory} onChange={setShowTradeHistory} />
          <Toggle label="Trade Rationale" enabled={showRationale} onChange={setShowRationale} />
          <Toggle label="Sectors" enabled={showSectors} onChange={setShowSectors} />
          <Toggle label="Risk Metrics" enabled={showRiskMetrics} onChange={setShowRiskMetrics} />
          <Toggle label="Watchlists" enabled={showWatchlists} onChange={setShowWatchlists} />
        </div>
      </section>

      {/* Trade Delay + Hide Share Count */}
      <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
        bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-3">
          Privacy Controls
        </h2>
        <div className="mb-3">
          <p className="text-sm text-rh-light-text dark:text-rh-text mb-2">Trade delay</p>
          <div className="flex gap-1.5">
            {DELAY_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                onClick={() => setTradeDelayHours(opt.hours)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                  tradeDelayHours === opt.hours
                    ? 'border-rh-green bg-rh-green/10 text-rh-green'
                    : 'border-gray-200 dark:border-white/[0.1] text-rh-light-muted dark:text-rh-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <Toggle label="Hide exact share counts" enabled={hideShareCount} onChange={setHideShareCount} />
      </section>

      {/* Pitch */}
      <section className="rounded-xl border border-gray-200/40 dark:border-white/[0.08]
        bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-4">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted dark:text-rh-muted mb-2">
          Your Pitch
        </h2>
        <textarea
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Tell potential subscribers about your investing approach..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.1]
            bg-white dark:bg-white/[0.04] text-sm text-rh-light-text dark:text-rh-text
            placeholder:text-rh-light-muted dark:placeholder:text-rh-muted
            focus:outline-none focus:ring-2 focus:ring-rh-green/50 resize-none"
        />
        <p className="mt-0.5 text-right text-[10px] text-rh-light-muted dark:text-rh-muted">
          {pitch.length}/500
        </p>
      </section>

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 rounded-xl bg-red-500/10 dark:bg-red-500/5 border border-red-500/20 dark:border-red-500/30 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Save */}
      <div className="flex items-center justify-end gap-2 pt-2 pb-8">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium rounded-lg
            text-rh-light-text dark:text-rh-text
            hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 text-sm font-semibold rounded-lg
            bg-rh-green/80 text-white hover:bg-rh-green/70 transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </motion.div>
  );
}
