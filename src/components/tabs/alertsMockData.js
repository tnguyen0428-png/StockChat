// ============================================
// UPTIKALERTS — alertsMockData.js
// Mock data for AlertsTab — fallbacks when live data unavailable
// TODO: Remove this file once fully wired to live data
// ============================================

// TODO: Replace with live VIX API data
export const MOCK_FEAR_SCORE = 18.42;

// TODO: Replace with FMP sector performance API
export const MOCK_SECTORS = [
  { name: 'Technology',  perf: 3.12 },
  { name: 'Healthcare',  perf: -0.87 },
  { name: 'Energy',      perf: 1.45 },
  { name: 'Financials',  perf: 0.63 },
  { name: 'Consumer',    perf: -1.54 },
  { name: 'Industrials', perf: 2.08 },
];

// TODO: Replace MOCK_ALERTS with live API data
// TODO: Calculate rsVsSpy from live SPY data
export const MOCK_ALERTS = [
  { id: 'mock-1', ticker: 'NVDA', name: 'Nvidia Corp',             alert_type: '52w_high',  price: 875.40, change: 2.14, volume: '41.2M',  time: '9:47 AM',   timeGroup: 'morning',    signal: 'Within 1.8% of 52-week high of $891.46',    confidence: 91, support: 848.00, resistance: 891.46, sector: 'Semiconductors',      recentPrices: [843,849,852,848,855,861,858,864,869,866,871,875],                  context: 'Designs GPUs powering AI data centers, autonomous vehicles, and PC gaming.',                             confidenceReason: 'High confidence: price within 2% of 52W high with strong institutional volume and no distribution days.',                  rsVsSpy: 1.42 },
  { id: 'mock-2', ticker: 'SMCI', name: 'Super Micro Computer',    alert_type: 'vol_surge', price: 92.17,  change: 5.31, volume: '38.1M',  time: '10:03 AM',  timeGroup: 'morning',    signal: 'Volume surging 4.2x 30-day average',          confidence: 78, support: 84.50,  resistance: 98.00,  sector: 'Technology Hardware', recentPrices: [81,83,82,84,85,83,86,87,88,86,89,91,92],                           context: 'Builds high-performance server and storage systems optimized for AI workloads.',                             confidenceReason: 'Moderate confidence: strong volume surge but price still below key resistance at $98.',                                     rsVsSpy: 4.59 },
  { id: 'mock-3', ticker: 'PLTR', name: 'Palantir Technologies',   alert_type: 'gap_up',    price: 24.88,  change: 4.63, volume: '29.7M',  time: '9:31 AM',   timeGroup: 'morning',    signal: 'Opened $1.10 above prior close of $23.78',    confidence: 85, support: 22.40,  resistance: 26.50,  sector: 'Software',            recentPrices: [22.8,23.1,23.0,23.4,23.2,23.7,23.6,24.0,24.2,24.5,24.7,24.88],   context: 'Provides AI-driven data analytics platforms to governments and large enterprises.',                           confidenceReason: 'High confidence: clean gap above prior consolidation zone with above-average volume confirming the move.',                  rsVsSpy: 3.91 },
  { id: 'mock-4', ticker: 'CRWD', name: 'CrowdStrike Holdings',    alert_type: 'ma_cross',  price: 334.50, change: 1.87, volume: '8.4M',   time: '11:15 AM',  timeGroup: 'morning',    signal: '20MA $321.14 crossed above 50MA $308.77',     confidence: 72, support: 310.00, resistance: 355.00, sector: 'Cybersecurity',       recentPrices: [318,322,319,325,321,328,324,329,327,331,330,334],                  context: 'Delivers cloud-native endpoint security and threat intelligence to enterprises globally.',                   confidenceReason: 'Moderate confidence: bullish MA cross confirmed but volume is near average — watch for follow-through.',                    rsVsSpy: 1.15 },
  { id: 'mock-5', ticker: 'AAPL', name: 'Apple Inc',               alert_type: '52w_high',  price: 196.45, change: 0.93, volume: '61.8M',  time: 'Yesterday', timeGroup: null,          signal: 'Within 0.9% of 52-week high of $198.23',      confidence: 88, support: 188.00, resistance: 198.23, sector: 'Consumer Electronics', recentPrices: [189,191,190,192,191,193,192,194,193,195,194,196,196.45],           context: 'Designs iPhones, Macs, and services including the App Store and Apple Intelligence.',                         confidenceReason: 'High confidence: steady approach to 52W high on consistent buying with low volatility and tight price action.',             rsVsSpy: 0.21 },
  { id: 'mock-6', ticker: 'AMD',  name: 'Advanced Micro Devices',  alert_type: 'vol_surge', price: 178.92, change: 3.44, volume: '52.3M',  time: 'Yesterday', timeGroup: null,          signal: 'Volume surging 3.1x 30-day average',          confidence: 63, support: 165.00, resistance: 190.00, sector: 'Semiconductors',      recentPrices: [182,180,178,176,174,172,171,173,174,176,177,179],                  context: 'Makes CPUs and GPUs for PCs, servers, and gaming consoles competing directly with Intel and Nvidia.',        confidenceReason: 'Lower confidence: volume spike is notable but price is in a short-term downtrend approaching key support.',                 rsVsSpy: -0.88 },
  { id: 'mock-7', ticker: 'TSLA', name: 'Tesla Inc',               alert_type: 'gap_up',    price: 189.30, change: 5.20, volume: '114.6M', time: '8:14 AM',   timeGroup: 'pre-market', signal: 'Opened $9.36 above prior close of $179.94',    confidence: 95, support: 175.00, resistance: 200.00, sector: 'Electric Vehicles',   recentPrices: [176,177,178,179,180,182,183,185,186,187,188,189,189.30],           context: 'Manufactures electric vehicles and energy storage systems, also developing full self-driving software.',      confidenceReason: 'Very high confidence: pre-market gap with 6x normal volume driven by a clear catalyst and clean technical setup.',          rsVsSpy: 4.48 },
  { id: 'mock-8', ticker: 'META', name: 'Meta Platforms',           alert_type: 'ma_cross',  price: 527.40, change: 1.22, volume: '12.1M',  time: '1:42 PM',   timeGroup: 'afternoon',  signal: '20MA $512.88 crossed above 50MA $498.33',     confidence: 68, support: 498.00, resistance: 545.00, sector: 'Social Media',        recentPrices: [538,534,530,526,522,519,516,514,517,520,522,525,527],              context: 'Operates Facebook, Instagram, and WhatsApp while investing heavily in AI and the metaverse.',                 confidenceReason: 'Moderate confidence: MA cross is valid but price has been pulling back from highs — needs volume to confirm.',              rsVsSpy: -0.50 },
];

// TODO: Replace with Supabase aotd_history table
export const MOCK_AOTD_HISTORY = [
  { date: 'Apr 2',  ticker: 'TSLA', name: 'Tesla Inc',              type: 'gap_up',    alertPrice: 189.30, alertChange: 5.20, confidence: 95, signal: 'Pre-market gap on 6x volume',    nextDayClose: 195.36, outcome: 3.20 },
  { date: 'Apr 1',  ticker: 'NVDA', name: 'Nvidia Corp',            type: '52w_high',  alertPrice: 875.40, alertChange: 2.14, confidence: 91, signal: 'Within 1.8% of 52W high',        nextDayClose: 891.15, outcome: 1.80 },
  { date: 'Mar 31', ticker: 'PLTR', name: 'Palantir Technologies',  type: 'gap_up',    alertPrice: 24.88,  alertChange: 4.63, confidence: 85, signal: 'Gap above consolidation zone',    nextDayClose: 24.78,  outcome: -0.40 },
  { date: 'Mar 28', ticker: 'SMCI', name: 'Super Micro Computer',   type: 'vol_surge', alertPrice: 92.17,  alertChange: 5.31, confidence: 78, signal: 'Volume 4.2x average',             nextDayClose: 94.66,  outcome: 2.70 },
  { date: 'Mar 27', ticker: 'AAPL', name: 'Apple Inc',              type: '52w_high',  alertPrice: 196.45, alertChange: 0.93, confidence: 88, signal: 'Approaching 52W high on low vol', nextDayClose: 197.63, outcome: 0.60 },
  { date: 'Mar 26', ticker: 'AMD',  name: 'Advanced Micro Devices', type: 'vol_surge', alertPrice: 178.92, alertChange: 3.44, confidence: 63, signal: 'Volume spike near key support',   nextDayClose: 176.95, outcome: -1.10 },
  { date: 'Mar 25', ticker: 'META', name: 'Meta Platforms',         type: 'ma_cross',  alertPrice: 527.40, alertChange: 1.22, confidence: 68, signal: '20MA crossed above 50MA',         nextDayClose: 533.87, outcome: 1.23 },
  { date: 'Mar 24', ticker: 'CRWD', name: 'CrowdStrike Holdings',   type: 'ma_cross',  alertPrice: 334.50, alertChange: 1.87, confidence: 72, signal: 'Bullish MA cross on avg volume',  nextDayClose: 340.18, outcome: 1.70 },
  { date: 'Mar 21', ticker: 'NVDA', name: 'Nvidia Corp',            type: 'vol_surge', alertPrice: 862.10, alertChange: 3.88, confidence: 82, signal: 'Volume 3.8x with new catalyst',   nextDayClose: 858.22, outcome: -0.45 },
  { date: 'Mar 20', ticker: 'TSLA', name: 'Tesla Inc',              type: '52w_high',  alertPrice: 181.50, alertChange: 2.75, confidence: 79, signal: 'Testing 52W high on earnings',     nextDayClose: null,   outcome: null },
];

export const BADGE_CONFIG = {
  '52w_high':  { color: '#D97706', bg: '#FFFBEB', border: 'rgba(217,119,6,0.25)',   label: '52W High'  },
  'vol_surge': { color: '#7C3AED', bg: '#F5F3FF', border: 'rgba(124,58,237,0.25)',  label: 'Vol Surge' },
  'gap_up':    { color: '#16A34A', bg: '#F0FDF4', border: 'rgba(22,163,74,0.25)',   label: 'Gap Up'    },
  'ma_cross':  { color: '#2563EB', bg: '#EFF6FF', border: 'rgba(37,99,235,0.25)',   label: 'MA Cross'  },
};

export const DARK_THEME = {
  '--text1': '#F3F4F6', '--text2': '#D1D5DB', '--text3': '#9CA3AF',
  '--card': '#1F2937', '--border': '#374151',
  '--green': '#22C55E', '--green-bg': 'rgba(34,197,94,0.12)',
  '--blue': '#60A5FA', '--blue-bg': 'rgba(96,165,250,0.12)',
  '--red': '#F87171', '--bg': '#111827',
};

export const LIGHT_THEME = {
  '--text1': '#111827', '--text2': '#6B7280', '--text3': '#9CA3AF',
  '--card': '#ffffff', '--border': '#E5E7EB',
  '--green': '#16A34A', '--green-bg': 'rgba(26,173,94,0.08)',
  '--blue': '#2563EB', '--blue-bg': 'rgba(37,99,235,0.08)',
  '--red': '#DC2626', '--bg': '#ffffff',
};

// TODO: Replace with FMP key stats endpoint
export const MOCK_KEY_STATS = {
  NVDA: { dayLow: 868.20, dayHigh: 879.44, wk52Low: 473.20, wk52High: 891.46, marketCap: '2.16T', marketCapDesc: 'One of the world\'s most valuable companies', avgVolume: '35.8M' },
  SMCI: { dayLow: 88.10, dayHigh: 93.85, wk52Low: 40.10, wk52High: 122.90, marketCap: '54.2B', marketCapDesc: 'Large-cap tech company', avgVolume: '28.4M' },
  PLTR: { dayLow: 23.90, dayHigh: 25.12, wk52Low: 13.68, wk52High: 27.50, marketCap: '54.8B', marketCapDesc: 'Large-cap software company', avgVolume: '42.1M' },
  CRWD: { dayLow: 328.40, dayHigh: 336.80, wk52Low: 200.81, wk52High: 398.33, marketCap: '81.4B', marketCapDesc: 'Major cybersecurity leader', avgVolume: '5.2M' },
  AAPL: { dayLow: 194.80, dayHigh: 197.10, wk52Low: 164.08, wk52High: 198.23, marketCap: '3.01T', marketCapDesc: 'The world\'s most valuable public company', avgVolume: '54.2M' },
  AMD:  { dayLow: 174.30, dayHigh: 180.15, wk52Low: 93.12, wk52High: 227.30, marketCap: '289B', marketCapDesc: 'Major semiconductor company', avgVolume: '44.7M' },
  TSLA: { dayLow: 183.20, dayHigh: 191.80, wk52Low: 138.80, wk52High: 278.98, marketCap: '604B', marketCapDesc: 'Leading electric vehicle maker', avgVolume: '98.3M' },
  META: { dayLow: 522.10, dayHigh: 530.80, wk52Low: 279.40, wk52High: 542.81, marketCap: '1.35T', marketCapDesc: 'Social media and AI giant', avgVolume: '16.8M' },
};
