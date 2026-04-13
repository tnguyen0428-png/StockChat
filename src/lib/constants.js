// Shared API key constants — pulled from Vite env vars
export const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;
export const FMP_KEY     = import.meta.env.VITE_FMP_API_KEY;

// Paper trading season config
export const STARTING_CASH = 50000;
export const SEASON_START  = new Date('2026-04-01');
export const SEASON_END    = new Date('2026-06-30');
