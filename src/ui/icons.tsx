export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
  </svg>
);

export const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
  </svg>
);

export const LocateIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M20.6 3.4 3.9 10.2c-.8.3-.7 1.5.1 1.7l6.6 1.5 1.5 6.6c.2.8 1.4.9 1.7.1l6.8-16.7Z" fill="currentColor" />
  </svg>
);

export const LegendIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11Z" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const LayersIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="m12 3 9 5-9 5-9-5 9-5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="m3 13 9 5 9-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** iOS's share symbol, inline with the install steps. */
export const ShareIcon = () => (
  <svg className="inline-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const SunIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" fill="currentColor" />
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </g>
  </svg>
);
