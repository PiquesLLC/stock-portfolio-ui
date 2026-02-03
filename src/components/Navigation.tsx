export type TabType = 'portfolio' | 'insights' | 'leaderboard' | 'feed' | 'watch';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const TAB_ICONS: Record<TabType, JSX.Element> = {
  portfolio: <svg className="w-5 h-5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h4v11H3zM10 3h4v18h-4zM17 7h4v14h-4z" /></svg>,
  insights: <svg className="w-5 h-5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  leaderboard: <svg className="w-5 h-5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l3.5 3.5L12 3l3.5 3.5L19 3v13a2 2 0 01-2 2H7a2 2 0 01-2-2V3z" /></svg>,
  watch: <svg className="w-5 h-5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  feed: <svg className="w-5 h-5 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
};

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const tabs: { id: TabType; label: string }[] = [
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'insights', label: 'Insights' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'watch', label: 'Watch' },
    { id: 'feed', label: 'Feed' },
  ];

  return (
    <nav className="border-b border-rh-light-border/60 dark:border-rh-border/60">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-around sm:justify-start sm:gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`group flex items-center gap-1.5 px-2 sm:px-4 py-3 text-sm font-medium transition-all duration-200 relative
                ${activeTab === tab.id
                  ? 'text-rh-green'
                  : 'text-rh-light-muted dark:text-rh-muted hover:text-rh-light-text dark:hover:text-rh-text'
                }`}
            >
              <span className={`transition-opacity duration-200 ${activeTab === tab.id ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`}>
                {TAB_ICONS[tab.id]}
              </span>
              <span className="hidden sm:inline">{tab.label}</span>
              {/* Active underline — animated */}
              <span className={`absolute bottom-0 left-2 right-2 h-0.5 bg-rh-green rounded-full nav-underline ${
                activeTab === tab.id ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
              }`} />
              {/* Hover underline hint */}
              {activeTab !== tab.id && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-current rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-200" />
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
