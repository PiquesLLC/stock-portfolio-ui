import { useState, useRef, useEffect } from 'react';

interface UserMenuProps {
  userName: string;
  userId: string;
  onProfileClick: () => void;
  onAlertsClick: () => void;
  onSettingsClick: () => void;
  onLogoutClick: () => void;
}

export function UserMenu({
  userName,
  onProfileClick,
  onAlertsClick,
  onSettingsClick,
  onLogoutClick
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get initial for avatar
  const initial = userName.charAt(0).toUpperCase();

  const menuItems = [
    { label: 'Profile', icon: ProfileIcon, onClick: onProfileClick },
    { label: 'Alerts', icon: AlertsIcon, onClick: onAlertsClick },
    { label: 'Account Settings', icon: SettingsIcon, onClick: onSettingsClick },
    { label: 'Log Out', icon: LogoutIcon, onClick: onLogoutClick, danger: true },
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2 py-1.5 rounded-lg cursor-pointer
          transition-all duration-150 ease-out
          hover:bg-gray-100 dark:hover:bg-rh-dark/80
          hover:brightness-110
          group"
      >
        {/* Avatar */}
        <div className="w-[22px] h-[22px] sm:w-[18px] sm:h-[18px] rounded-full bg-gradient-to-br from-rh-green/80 to-rh-green
          flex items-center justify-center text-[11px] sm:text-[10px] font-bold text-black/90
          ring-1 ring-white/10 dark:ring-white/5">
          {initial}
        </div>

        {/* Username - hidden on mobile */}
        <span className="hidden sm:inline text-sm font-semibold text-rh-light-text/90 dark:text-rh-text/90
          group-hover:text-rh-light-text dark:group-hover:text-rh-text
          transition-colors">
          {userName}
        </span>

        {/* Chevron - hidden on mobile */}
        <svg
          className={`hidden sm:block w-3 h-3 text-rh-light-muted dark:text-rh-muted transition-transform duration-150
            ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-48 py-1.5
          bg-white dark:bg-rh-dark
          border border-gray-200 dark:border-rh-border/60
          rounded-lg shadow-lg shadow-black/10 dark:shadow-black/30
          z-50 overflow-hidden
          animate-in fade-in slide-in-from-top-2 duration-150">
          {menuItems.map((item, index) => (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm
                transition-colors duration-100
                ${item.danger
                  ? 'text-rh-red hover:bg-rh-red/10'
                  : 'text-rh-light-text dark:text-rh-text hover:bg-gray-100 dark:hover:bg-rh-border/40'
                }
                ${index === menuItems.length - 1 ? 'border-t border-gray-100 dark:border-rh-border/40 mt-1 pt-2' : ''}
              `}
            >
              <item.icon className="w-4 h-4 opacity-60" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Icon components
function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function AlertsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
