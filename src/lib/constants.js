// Theme definitions
export const DARK_THEME = {
  '--bg': '#111827', '--card': '#1F2937', '--card2': '#1a2332', '--border': '#374151',
  '--text1': '#F3F4F6', '--text2': '#D1D5DB', '--text3': '#9CA3AF',
  '--green': '#22C55E', '--green-bg': 'rgba(34,197,94,0.12)', '--green-border': 'rgba(34,197,94,0.3)',
  '--navy': '#0f1a2e', '--navy-dark': '#0a1220', '--navy-light': '#1a2332',
  '--navy-card': '#1F2937', '--navy-border': '#374151', '--navy-text': '#F3F4F6', '--navy-muted': '#9CA3AF',
  '--green-accent': '#22C55E', '--green-button': '#16A34A', '--green-btn': '#16A34A',
  '--red': '#F87171', '--red-bg': 'rgba(248,113,113,0.12)',
  '--yellow': '#FBBF24', '--yellow-bg': 'rgba(251,191,36,0.12)',
  '--blue': '#60A5FA', '--blue-bg': 'rgba(96,165,250,0.12)',
  '--shadow-sm': '0 1px 3px rgba(0,0,0,0.2)', '--shadow-md': '0 2px 8px rgba(0,0,0,0.3)',
};

export const LIGHT_THEME = {
  '--bg': '#eef2f7', '--card': '#f8fafc', '--card2': '#dfe6ef', '--border': '#d8e2ed',
  '--text1': '#1a2d4a', '--text2': '#4a6078', '--text3': '#7a8ea3',
  '--green': '#8cd9a0', '--green-bg': '#e8f5ed', '--green-border': 'rgba(140,217,160,0.3)',
  '--navy': '#132d52', '--navy-dark': '#0f2440', '--navy-light': '#eef2f7',
  '--navy-card': '#f8fafc', '--navy-border': '#d8e2ed', '--navy-text': '#1a2d4a', '--navy-muted': '#7a8ea3',
  '--green-accent': '#8cd9a0', '--green-button': '#2a7d4b', '--green-btn': '#2a7d4b',
  '--red': '#E24B4A', '--red-bg': '#FEF2F2',
  '--yellow': '#D4A017', '--yellow-bg': '#FFFBEB',
  '--blue': '#4A90D9', '--blue-bg': '#EFF6FF',
  '--shadow-sm': '0 1px 3px rgba(0,0,0,0.04)', '--shadow-md': '0 2px 8px rgba(0,0,0,0.06)',
};

// Shared API key constants — pulled from Vite env vars
export const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
export const FMP_KEY     = import.meta.env.VITE_FMP_API_KEY;

// Paper trading season config
export const STARTING_CASH = 50000;
export const SEASON_START  = new Date('2026-04-01');
export const SEASON_END    = new Date('2026-06-30');
