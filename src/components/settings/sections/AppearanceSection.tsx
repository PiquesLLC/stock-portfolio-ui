import { ToggleSwitch } from '../ToggleSwitch';

interface AppearanceSectionProps {
  theme: 'dark' | 'light';
  setTheme: (v: 'dark' | 'light') => void;
  extendedHours: boolean;
  setExtendedHours: (v: boolean) => void;
  starfieldEnabled: boolean;
  setStarfieldEnabled: (v: boolean) => void;
}

export function AppearanceSection({
  theme,
  setTheme,
  extendedHours,
  setExtendedHours,
  starfieldEnabled,
  setStarfieldEnabled,
}: AppearanceSectionProps) {
  return (
    <div className="space-y-7">
      <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.04] backdrop-blur-xl p-6 space-y-5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/80 dark:text-rh-muted/60 pb-3 border-b border-gray-200/30 dark:border-white/[0.05]">Display</h3>

        {/* Theme */}
        <div>
          <label className="block text-sm font-medium text-rh-light-text dark:text-rh-text mb-1">
            Theme
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${theme === 'dark'
                  ? 'bg-rh-green text-black'
                  : 'bg-gray-100 dark:bg-rh-border text-rh-light-muted dark:text-rh-muted hover:bg-gray-200 dark:hover:bg-rh-border/80'
                }`}
            >
              Dark
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${theme === 'light'
                  ? 'bg-rh-green text-black'
                  : 'bg-gray-100 dark:bg-rh-border text-rh-light-muted dark:text-rh-muted hover:bg-gray-200 dark:hover:bg-rh-border/80'
                }`}
            >
              Light
            </button>
          </div>
        </div>

        {/* Extended Hours */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Extended Hours</span>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">Show pre/post market prices by default</p>
          </div>
          <ToggleSwitch checked={extendedHours} onChange={setExtendedHours} />
        </label>

        {/* Starfield Background */}
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-sm font-medium text-rh-light-text dark:text-rh-text">Starfield Background</span>
            <p className="text-xs text-rh-light-muted dark:text-rh-muted">Animated stars in dark mode (desktop only)</p>
          </div>
          <ToggleSwitch checked={starfieldEnabled} onChange={setStarfieldEnabled} />
        </label>
      </div>
    </div>
  );
}
