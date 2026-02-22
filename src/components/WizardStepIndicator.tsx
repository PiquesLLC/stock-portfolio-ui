const WIZARD_STEPS = [
  { key: 'ticker', label: 'TICKERS' },
  { key: 'date', label: 'DATES' },
  { key: 'price', label: 'PRICE' },
  { key: 'shares', label: 'SHARES' },
  { key: 'totalAmount', label: 'AMOUNT' },
  { key: 'action', label: 'ACTION' },
] as const;

export type WizardStepKey = typeof WIZARD_STEPS[number]['key'];

interface WizardStepIndicatorProps {
  currentStep: WizardStepKey;
  completedSteps: Set<WizardStepKey>;
  skippedSteps: Set<WizardStepKey>;
}

export function WizardStepIndicator({ currentStep, completedSteps, skippedSteps }: WizardStepIndicatorProps) {
  const currentIndex = WIZARD_STEPS.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {WIZARD_STEPS.map((step, i) => {
        const isCurrent = step.key === currentStep;
        const isCompleted = completedSteps.has(step.key);
        const isSkipped = skippedSteps.has(step.key);
        const isPast = i < currentIndex;

        return (
          <div key={step.key} className="flex items-center gap-1.5">
            {i > 0 && (
              <div className={`w-3 h-px ${isPast || isCurrent ? 'bg-rh-green/40' : 'bg-gray-300/30 dark:bg-white/[0.08]'}`} />
            )}
            <div className="flex items-center gap-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                isCurrent
                  ? 'bg-rh-green text-black'
                  : isCompleted
                    ? 'bg-rh-green/20 text-rh-green'
                    : isSkipped
                      ? 'bg-gray-200/30 dark:bg-white/[0.06] text-rh-light-muted/50 dark:text-rh-muted/40'
                      : 'border border-gray-300/40 dark:border-white/[0.1] text-rh-light-muted/50 dark:text-rh-muted/40'
              }`}>
                {isCompleted ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-[10px] font-medium tracking-wide whitespace-nowrap ${
                isCurrent
                  ? 'text-rh-green'
                  : isCompleted
                    ? 'text-rh-green/60'
                    : 'text-rh-light-muted/40 dark:text-rh-muted/30'
              }`}>
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { WIZARD_STEPS };
