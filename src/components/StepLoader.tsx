import { useState, useEffect, useRef } from 'react';

interface StepLoaderProps {
  title: string;
  steps: string[];
  /** Step interval in ms — used as fallback when currentStep is not provided (default 3000) */
  interval?: number;
  /** Externally controlled step index. When provided, the internal timer is disabled and progress tracks real completion. */
  currentStep?: number;
  /** Optional wrapper className */
  className?: string;
}

export function StepLoader({ title, steps, interval = 3000, currentStep, className = '' }: StepLoaderProps) {
  const [internalStep, setInternalStep] = useState(0);
  const activeStep = currentStep ?? internalStep;
  const [typedText, setTypedText] = useState('');
  const [stepVisible, setStepVisible] = useState(true);
  const fullText = steps[activeStep] || '';
  const prevStepRef = useRef(activeStep);

  // Timer-based fallback when currentStep is not provided
  useEffect(() => {
    if (currentStep != null) return;
    const id = setInterval(() => {
      setInternalStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
    }, interval);
    return () => clearInterval(id);
  }, [steps.length, interval, currentStep]);

  // Slide-in entrance animation on step change
  useEffect(() => {
    if (prevStepRef.current !== activeStep) {
      setStepVisible(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setStepVisible(true));
      });
      prevStepRef.current = activeStep;
      return () => cancelAnimationFrame(id);
    }
  }, [activeStep]);

  // Typing animation
  useEffect(() => {
    setTypedText('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i <= fullText.length) setTypedText(fullText.slice(0, i));
      else clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [activeStep, fullText]);

  return (
    <div className={`p-6 sm:max-w-sm sm:mx-auto ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-rh-green/10 border border-rh-green/20 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-rh-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-rh-light-text dark:text-white">{title}</p>
          <p className="text-[11px] text-rh-light-muted/50 dark:text-white/25">Powered by NALA AI</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {steps.map((step, i) => {
          const isActive = i === activeStep;
          const isDone = i < activeStep;
          return (
            <div
              key={i}
              className={`flex items-center gap-2.5 transition-all duration-500 ${isActive ? 'opacity-100' : isDone ? 'opacity-40' : 'opacity-15'}`}
              style={isActive ? {
                transform: stepVisible ? 'translateY(0)' : 'translateY(6px)',
                opacity: stepVisible ? 1 : 0,
                transition: 'transform 400ms cubic-bezier(0.16,1,0.3,1), opacity 400ms ease-out',
              } : undefined}
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all duration-500 ${
                isDone ? 'bg-rh-green/20 text-rh-green' : isActive ? 'bg-rh-green text-black' : 'bg-gray-200/60 dark:bg-white/[0.06] text-rh-light-muted dark:text-white/30'
              }`}>
                {isDone ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (i + 1)}
              </div>
              {isActive ? (
                <span className="step-loader-shimmer text-[12px] font-medium">
                  {typedText}
                  <span className="inline-block w-[2px] h-[12px] bg-rh-green ml-0.5 align-middle animate-pulse" />
                </span>
              ) : (
                <span className={`text-[12px] transition-all duration-500 ${isDone ? 'text-rh-light-muted dark:text-white/50' : 'text-rh-light-muted/50 dark:text-white/30'}`}>
                  {step}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 h-1 bg-gray-200/60 dark:bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-rh-green/60 to-rh-green rounded-full transition-all ease-linear"
          style={{
            width: `${Math.min(95, ((activeStep + 1) / steps.length) * 100)}%`,
            transitionDuration: `${interval}ms`,
          }}
        />
      </div>
    </div>
  );
}
