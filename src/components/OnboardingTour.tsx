import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OnboardingTourProps {
  onComplete: () => void;  // "Get Started" — seed portfolio + dismiss
  onSkip: () => void;      // "Skip tour" — dismiss without seeding
}

interface TourStep {
  icon: JSX.Element;
  title: string;
  description: string;
}

const STEPS: TourStep[] = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h4v11H3zM10 3h4v18h-4zM17 7h4v14h-4z" />
      </svg>
    ),
    title: 'Your Portfolio',
    description: 'Track all your holdings in one place. See real-time P&L, daily changes, and your portfolio\'s overall performance at a glance.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    title: 'Daily Briefing',
    description: 'Every day, Nala generates a personalized AI briefing about your holdings — earnings, analyst moves, and what to watch.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Nala Score',
    description: 'Your portfolio gets a unique health grade — from A+ to F — based on diversification, risk exposure, and momentum signals.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Intelligence Events',
    description: 'See AI-detected earnings reports, analyst upgrades and downgrades, and dividend events overlaid directly on your charts.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    title: 'Ask Nala',
    description: 'Chat with Nala about any stock or your portfolio. Get instant AI-powered analysis, comparisons, and investment insights.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Get Started!',
    description: 'We\'ll add a sample portfolio with 5 popular stocks so you can explore everything Nala has to offer. You can replace them with your own holdings anytime.',
  },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
  }),
};

export function OnboardingTour({ onComplete, onSkip }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [loading, setLoading] = useState(false);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const goNext = useCallback(() => {
    if (isLast) return;
    setDirection(1);
    setStep(s => s + 1);
  }, [isLast]);

  const goBack = useCallback(() => {
    if (step === 0) return;
    setDirection(-1);
    setStep(s => s - 1);
  }, [step]);

  const handleGetStarted = useCallback(async () => {
    setLoading(true);
    try {
      await onComplete();
    } catch {
      // onComplete handles errors
    } finally {
      setLoading(false);
    }
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative w-full max-w-md bg-white dark:bg-[#1a1a1e] rounded-2xl border-2 border-amber-500/50 shadow-2xl shadow-amber-500/10 overflow-hidden"
      >
        {/* Top accent line */}
        <div className="h-1 bg-gradient-to-r from-amber-500/60 via-amber-400/80 to-amber-500/60" />

        {/* Step counter */}
        <div className="px-6 pt-5 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-amber-500/80">
            Step {step + 1} of {STEPS.length}
          </span>
          <button
            onClick={onSkip}
            className="text-[11px] font-medium text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50 transition-colors"
          >
            Skip tour
          </button>
        </div>

        {/* Content area — fixed height so card doesn't jump */}
        <div className="px-6 pt-4 pb-2 min-h-[220px] flex flex-col items-center justify-center">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="flex flex-col items-center text-center w-full"
            >
              {/* Icon circle */}
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-4">
                {current.icon}
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {current.title}
              </h2>

              {/* Description */}
              <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed max-w-sm">
                {current.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => { setDirection(i > step ? 1 : -1); setStep(i); }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === step
                  ? 'bg-amber-500 w-5'
                  : i < step
                    ? 'bg-amber-500/40'
                    : 'bg-gray-300 dark:bg-white/15'
              }`}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              onClick={goBack}
              className="px-4 py-2.5 text-sm font-medium rounded-lg
                text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60
                hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {isLast ? (
            <button
              onClick={handleGetStarted}
              disabled={loading}
              className="flex-1 max-w-[200px] px-6 py-2.5 text-sm font-semibold rounded-lg
                bg-rh-green text-black hover:bg-green-500 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Setting up...
                </span>
              ) : 'Get Started'}
            </button>
          ) : (
            <button
              onClick={goNext}
              className="px-6 py-2.5 text-sm font-semibold rounded-lg
                bg-amber-500 text-white hover:bg-amber-400 transition-colors"
            >
              Next
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
