// ============================================
// UPTIKALERTS — homeConstants.js
// Shared constants for HomeTab and its sub-components
// ============================================

// ── Popular tickers for new user onboarding ──
export const POPULAR_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'AMD', 'SPY', 'META'];

// ── Onboarding sector picks ──
export const ONBOARD_TRENDING = [
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
  { symbol: 'META', name: 'Meta' },
];

export const ONBOARD_SECTORS = [
  { name: 'Technology', color: '#4CAF50', tickers: ['MSFT', 'GOOG', 'AMZN', 'CRM', 'INTC'] },
  { name: 'Energy', color: '#FF9800', tickers: ['XOM', 'CVX', 'OXY', 'SLB'] },
  { name: 'Healthcare', color: '#E91E63', tickers: ['JNJ', 'UNH', 'PFE', 'ABBV'] },
  { name: 'Finance', color: '#2196F3', tickers: ['JPM', 'BAC', 'GS', 'V'] },
  { name: 'Consumer', color: '#9C27B0', tickers: ['DIS', 'NKE', 'SBUX', 'MCD'] },
];

export const FUTURES_MAP = {
  'ES=F': 'S&P Fut',
  'NQ=F': 'Nas Fut',
  'YM=F': 'Dow Fut',
  'GC=F': 'Gold',
  'CL=F': 'Oil',
};
