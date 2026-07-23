// ── Icon glyphs ──────────────────────────────────
// Inline SVG strings used by dataset cards and panel headers. Split out of
// panels.js because config/uhus.js references ICONS.* and must load first.
const ICONS = {
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></svg>`,
  sales: `<svg viewBox="0 0 24 24"><path d="M4 18V9"/><path d="M10 18V5"/><path d="M16 18v-7"/><path d="M22 18v-4"/><path d="M2 18h20"/></svg>`,
  map: `<svg viewBox="0 0 24 24"><path d="M4 6l6-2 4 2 6-2v14l-6 2-4-2-6 2z"/><path d="M10 4v14"/><path d="M14 6v14"/></svg>`,
  pin: `<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.7-6-10a6 6 0 0 1 12 0c0 4.3-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>`,
  thermometer: `<svg viewBox="0 0 24 24"><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/><path d="M12 9v7"/></svg>`,
  flag: `<svg viewBox="0 0 24 24"><path d="M6 3v18"/><path d="M6 6c2-1.5 4-.5 6 .5s4 2 6 .5v8c-2 1.5-4 .5-6-.5s-4-2-6-.5"/></svg>`,
  building: `<svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V9l7-4 7 4v12"/><path d="M9 21v-6h6v6"/></svg>`,
  mobility: `<svg viewBox="0 0 24 24"><path d="M5 18h10"/><path d="M13 6l6 6-6 6"/><path d="M5 6h6"/></svg>`,
  chart: `<svg viewBox="0 0 24 24"><path d="M4 17l5-5 4 4 7-9"/><path d="M4 4v16h16"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24"><path d="M8 3v3M16 3v3"/><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="M9 14h2M13 14h2"/></svg>`,
  dashboard: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 10v10"/></svg>`,
  profile: `<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M3 12h18"/><path d="M5 19l14-14"/></svg>`,
};
