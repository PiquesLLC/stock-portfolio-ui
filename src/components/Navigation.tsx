export type TabType = 'portfolio' | 'insights' | 'leaderboard' | 'feed';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const tabs: { id: TabType; label: string }[] = [
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'insights', label: 'Insights' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'feed', label: 'Feed' },
  ];

  return (
    <nav className="border-b border-rh-light-border dark:border-rh-border bg-rh-light-card dark:bg-rh-card">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors relative
                ${activeTab === tab.id
                  ? 'text-rh-green'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rh-green" />
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
