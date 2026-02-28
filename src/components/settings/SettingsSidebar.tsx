export type SettingsSection = 'profile' | 'appearance' | 'security' | 'billing' | 'notifications' | 'data' | 'creator';

interface SidebarGroup {
  label: string;
  items: { id: SettingsSection; label: string; icon: JSX.Element }[];
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: 'Account',
    items: [
      {
        id: 'profile',
        label: 'Profile',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
      },
      {
        id: 'security',
        label: 'Security',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Preferences',
    items: [
      {
        id: 'appearance',
        label: 'Appearance',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        ),
      },
      {
        id: 'notifications',
        label: 'Notifications',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Billing & Data',
    items: [
      {
        id: 'billing',
        label: 'Billing',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        ),
      },
      {
        id: 'data',
        label: 'Portfolio Data',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        ),
      },
      {
        id: 'creator',
        label: 'Creator',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        ),
      },
    ],
  },
];

interface SettingsSidebarProps {
  activeSection: SettingsSection | null;
  onSelectSection: (section: SettingsSection) => void;
  onPrivacyPolicy: () => void;
  isMobile: boolean;
}

export function SettingsSidebar({
  activeSection,
  onSelectSection,
  onPrivacyPolicy,
  isMobile,
}: SettingsSidebarProps) {
  if (isMobile) {
    return (
      <nav className="w-full space-y-6">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/60 dark:text-rh-muted/60 px-1 mb-1.5">
              {group.label}
            </p>
            <div className="rounded-xl border border-gray-200/40 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] overflow-hidden divide-y divide-gray-100 dark:divide-white/[0.04]">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectSection(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-rh-light-text dark:text-rh-text hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors text-left"
                >
                  <span className="text-rh-light-muted dark:text-rh-muted">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <svg className="w-4 h-4 text-rh-light-muted/40 dark:text-rh-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div className="pt-2 px-1">
          <button
            onClick={onPrivacyPolicy}
            className="text-xs text-rh-light-muted/50 dark:text-rh-muted/50 hover:text-rh-light-muted dark:hover:text-rh-muted transition-colors"
          >
            Privacy Policy & Terms
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="w-48 flex-shrink-0">
      <div className="sticky top-24 space-y-5">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rh-light-muted/50 dark:text-rh-muted/50 px-3 mb-1">
              {group.label}
            </p>
            <div className="space-y-px">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-left
                    ${activeSection === item.id
                      ? 'bg-rh-green/10 text-rh-green'
                      : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text hover:bg-gray-100/50 dark:hover:bg-white/[0.04]'
                    }`}
                >
                  <span className={`flex-shrink-0 ${activeSection === item.id ? 'text-rh-green' : ''}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Footer — navigation only */}
        <div className="pt-4 mt-4 border-t border-gray-200/20 dark:border-white/[0.03]">
          <button
            onClick={onPrivacyPolicy}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-rh-light-muted/50 dark:text-rh-muted/40
              hover:text-rh-light-muted dark:hover:text-rh-muted hover:bg-gray-100/50 dark:hover:bg-white/[0.04] transition-colors text-left"
          >
            Privacy & Terms
          </button>
        </div>
      </div>
    </nav>
  );
}
