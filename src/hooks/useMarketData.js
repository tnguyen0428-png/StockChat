import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { isWeekend, isMarketHoliday, isMarketOpen, isAfterHours } from '../utils/marketUtils';
import { POLYGON_KEY, FMP_KEY } from '../lib/constants';

const FUTURES_MAP = {
  'ES=F': 'S&P Fut',
  'NQ=F': 'Nas Fut',
  'YM=F': 'Dow Fut',
  'GC=F': 'Gold',
  'CL=F': 'Oil',
};

export function useMarketData() {
  const [marketPulse, setMarketPulse]           = useState({});
  const [marketIndicators, setMarketIndicators] = useState([]);
  const [futuresData, setFuturesData]           = useState({});
  const [futuresLabels, setFuturesLabels]       = useState([]);

  const getMarketStatus = () => {
    const now = new Date();
    const est = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = est.getDay();
    const timeInMinutes = est.getHours() * 60 + est.getMinutes();
    if (day === 0 || day === 6) return 'closed';
    if (isMarketHoliday()) return 'closed';
    if (timeInMinutes < 570) return 'premarket';
    if (timeInMinutes >= 570 && timeInMinutes < 960) return 'open';
    return 'afterhours';
  };

  const marketStatus = getMarketStatus();

  const loadFutures = async () => {
    console.log('[Futures] Loading real futures data...');

    // ── PRIMARY: Supabase edge function (server-side Yahoo, no CORS issues) ──
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-futures`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.futures?.length > 0) {
          const pulse = {};
          const labels = [];
          data.futures.forEach(f => {
            pulse[f.symbol] = { price: f.price, change: f.pctChange, label: 'FUT', isFutures: true };
            labels.push({ key: f.symbol, label: f.label });
          });
          console.log(`[Futures] Edge function: ${data.futures.length}/5`, data.futures.map(f => `${f.label} ${f.pctChange.toFixed(2)}%`));
          setFuturesData(pulse);
          setFuturesLabels(labels);
          return;
        }
      }
      console.warn('[Futures] Edge function returned no data, trying CORS proxies...');
    } catch (err) {
      console.warn('[Futures] Edge function failed:', err.message);
    }

    // ── FALLBACK: CORS proxies for Yahoo Finance ──
    const symbols = Object.keys(FUTURES_MAP).join(',');
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
    const CORS_PROXIES = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
    ];

    for (const proxyUrl of CORS_PROXIES) {
      try {
        const res = await fetch(proxyUrl);
        if (!res.ok) continue;
        const data = await res.json();
        const quotes = data.quoteResponse?.result;
        if (!quotes || quotes.length === 0) continue;

        const pulse = {};
        const labels = [];
        for (const sym of Object.keys(FUTURES_MAP)) {
          const q = quotes.find(r => r.symbol === sym);
          if (!q) continue;
          const price = q.regularMarketPrice;
          const prev = q.regularMarketPreviousClose || q.previousClose;
          if (!price || !prev) continue;
          const pctChange = ((price - prev) / prev) * 100;
          pulse[sym] = { price, change: pctChange, label: 'FUT', isFutures: true };
          labels.push({ key: sym, label: FUTURES_MAP[sym] });
        }

        if (labels.length >= 1) {
          console.log(`[Futures] CORS proxy: ${labels.length}/5`);
          setFuturesData(pulse);
          setFuturesLabels(labels);
          return;
        }
      } catch (e) {
        // One Yahoo CORS proxy path failed — silent fallthrough to the
        // next proxy / ETF fallback is by design, but log in DEV so we
        // notice when every path is dying at once.
        if (import.meta.env.DEV) console.warn('[useMarketData] Yahoo CORS proxy failed:', e?.message || e);
      }
    }

    // ── All Yahoo methods failed — ETF fallback ──
    console.log('[Futures] All Yahoo failed, falling back to ETFs');
    await loadFuturesETFFallback();
  };

  const loadFuturesETFFallback = async () => {
    if (!FMP_KEY) return;
    const etfMap = { SPY: 'S&P 500', QQQ: 'Nasdaq', DIA: 'Dow', GLD: 'Gold', USO: 'Oil' };
    const tickers = Object.keys(etfMap);
    try {
      const results = await Promise.allSettled(
        tickers.map(t =>
          fetch(`https://financialmodelingprep.com/stable/quote?symbol=${t}&apikey=${FMP_KEY}`)
            .then(r => r.json())
        )
      );
      const pulse = {};
      const futLabels = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]) {
          const q = r.value[0];
          const ticker = tickers[idx];
          if (q.price) {
            const pctChange = q.changesPercentage ?? q.changePercentage ?? 0;
            pulse[ticker] = { price: q.price, change: pctChange, label: 'FUT', isFutures: true };
            futLabels.push({ key: ticker, label: etfMap[ticker] });
          }
        }
      });
      if (futLabels.length > 0) {
        setFuturesData(pulse);
        setFuturesLabels(futLabels);
      }
    } catch (err) {
      console.error('[Futures ETF Fallback] Error:', err.message);
    }
  };

  const loadFMPFallback = async () => {
    if (!FMP_KEY) return;
    const fallbackTickers = ['SPY', 'QQQ', 'DIA', 'IWM', 'AAPL'];
    const fallbackLabels = { SPY: 'S&P 500', QQQ: 'Nasdaq', DIA: 'Dow', IWM: 'Russell', AAPL: 'Apple' };
    try {
      const results = await Promise.allSettled(
        fallbackTickers.map(t =>
          fetch(`https://financialmodelingprep.com/stable/quote?symbol=${t}&apikey=${FMP_KEY}`)
            .then(r => r.json())
        )
      );
      const pulse = {};
      const indicators = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]) {
          const q = r.value[0];
          const ticker = fallbackTickers[idx];
          if (q.price) {
            pulse[ticker] = { price: q.price, change: q.changesPercentage ?? q.changePercentage ?? 0, label: '' };
            indicators.push({ ticker, label: fallbackLabels[ticker] || ticker, position: idx });
          }
        }
      });
      if (Object.keys(pulse).length > 0) {
        setMarketPulse(prev => ({ ...prev, ...pulse }));
        setMarketIndicators(prev => prev.length > 0 ? prev : indicators);
      }
    } catch (err) {
      console.error('[FMP Fallback] Error:', err.message);
    }
  };

  const loadMarketPulse = async (indicators = marketIndicators) => {
    try {
      const tickers = indicators.map(m => m.ticker);
      if (tickers.length === 0) return;

      const fetchTickers = isAfterHours()
        ? tickers.filter(t => ['SPY', 'QQQ', 'DIA'].includes(t))
        : tickers;

      let pulse = {};
      let polygonWorked = false;

      if (fetchTickers.length > 0 && !isWeekend() && !isMarketHoliday()) {
        try {
          const res = await fetch(
            `https://api.polygon.io/v3/snapshot?ticker.any_of=${fetchTickers.join(',')}&apiKey=${POLYGON_KEY}`
          );
          const data = await res.json();

          (data.results || []).forEach(t => {
            const s = t.session;
            const ms = t.market_status;
            let change = s.regular_trading_change_percent;
            let price = s.close || s.price;
            let label = '';
            if (ms !== 'open') {
              if (s.late_trading_change_percent) {
                change = s.late_trading_change_percent;
                price = s.close + (s.late_trading_change || 0);
                label = 'AH';
              } else if (s.early_trading_change_percent) {
                change = s.early_trading_change_percent;
                label = 'PM';
              }
            }
            pulse[t.ticker] = { price, change, label };
          });

          if (isMarketOpen()) {
            const missing = tickers.filter(t => !pulse[t]);
            for (let i = 0; i < missing.length; i += 20) {
              if (i > 0) await new Promise(r => setTimeout(r, 1000));
              try {
                const batch = missing.slice(i, i + 20);
                const r = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${batch.join(',')}&apiKey=${POLYGON_KEY}`);
                const d = await r.json();
                (d.tickers || []).forEach(t => {
                  const price = t.day?.c || t.prevDay?.c || 0;
                  const prev = t.prevDay?.c || t.day?.o || price;
                  pulse[t.ticker] = { price, change: prev ? ((price - prev) / prev) * 100 : 0, label: '' };
                });
              } catch (e) {
                if (import.meta.env.DEV) console.warn('[useMarketData] Polygon batch snapshot failed:', e?.message || e);
              }
            }
          }
          polygonWorked = Object.keys(pulse).length > 0;
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[useMarketData] Polygon snapshot outer failed:', e?.message || e);
          polygonWorked = false;
        }
      }

      if (!polygonWorked && FMP_KEY) {
        const fmpTickers = tickers.length > 0 ? tickers : ['SPY', 'QQQ', 'DIA'];
        try {
          const results = await Promise.allSettled(
            fmpTickers.map(t =>
              fetch(`https://financialmodelingprep.com/stable/quote?symbol=${t}&apikey=${FMP_KEY}`)
                .then(r => r.json())
            )
          );
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]) {
              const q = r.value[0];
              const ticker = fmpTickers[idx];
              if (q.price) {
                pulse[ticker] = { price: q.price, change: q.changesPercentage ?? q.changePercentage ?? 0, label: '' };
              }
            }
          });
        } catch (err) {
          console.error('[MarketPulse FMP fallback] Error:', err.message);
        }
      }

      setMarketPulse(pulse);
    } catch (err) {
      console.error('[MarketData] loadMarketPulse failed:', err.message);
    }
  };

  const loadMarketIndicators = async () => {
    try {
      const { data, error } = await supabase
        .from('market_indicators')
        .select('*')
        .order('position', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        setMarketIndicators(data);
        await loadMarketPulse(data);
        const status = getMarketStatus();
        if (status !== 'open') await loadFutures();
      } else {
        await loadFMPFallback();
      }
    } catch (err) {
      console.error('[MarketData] loadMarketIndicators failed:', err.message);
      // Best-effort fallback so the ticker bar isn't empty
      await loadFMPFallback();
    }
  };

  return { marketPulse, marketIndicators, futuresData, futuresLabels, marketStatus, loadMarketIndicators };
}
