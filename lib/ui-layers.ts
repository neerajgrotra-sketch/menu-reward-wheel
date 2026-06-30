// Single source of truth for stacking order. Never hardcode a z-index — import a value from here.
export const UI_LAYERS = {
  sidebar: 40,
  header: 40,
  drawer: 40,
  dropdown: 50,
  modal: 60,
  bottomSheet: 70,
  criticalOverlay: 80,
} as const;
