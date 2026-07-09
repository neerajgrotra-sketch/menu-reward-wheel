const ICON_PATHS: Record<string, JSX.Element> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </>
  ),
  send: (
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6,11 12,5 18,11" />
    </>
  ),
  check: <polyline points="4,12.5 9,17.5 20,6" />,
  tag: (
    <>
      <path d="M3 11V4h7l10 10-7 7Z" />
      <circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  list: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
      <line x1="10" y1="6.5" x2="10" y2="17.5" strokeDasharray="2 2.4" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5Z" />
      <polyline points="8.5,12 11,14.5 15.5,9.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5Z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <line x1="12" y1="12" x2="18" y2="7" />
    </>
  ),
  store: (
    <>
      <path d="M3 9 4 3h16l1 6" />
      <path d="M4 9v11h16V9" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
};

export type DashboardIconName = keyof typeof ICON_PATHS;

export function DashboardIconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {Object.entries(ICON_PATHS).map(([name, path]) => (
          <symbol
            key={name}
            id={`dash-i-${name}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {path}
          </symbol>
        ))}
        <symbol id="dash-i-sparkle" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.5 13.7 9.6 21 12 13.7 14.4 12 21.5 10.3 14.4 3 12 10.3 9.6Z" />
        </symbol>
      </defs>
    </svg>
  );
}

export function DashboardIcon({ name, className }: { name: DashboardIconName | 'sparkle'; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#dash-i-${name}`} />
    </svg>
  );
}
