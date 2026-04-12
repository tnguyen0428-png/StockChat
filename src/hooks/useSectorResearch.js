import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { safeGet, safeSet, safeRemove } from '../lib/safeStorage';
import { FMP_KEY } from '../lib/constants';

const SHORT_SECTOR = {
  'Communication Services': 'Communication', 'Communication': 'Communication',
  'Consumer Discretionary': 'Consumer', 'Consumer Cyclical': 'Consumer',
  'Consumer Defensive': 'Consumer', 'Consumer Staples': 'Consumer',
  'Information Technology': 'Tech', 'Technology': 'Tech',
  'Industrials': 'Industrial', 'Industrial': 'Industrial',
  'Financial Services': 'Finance', 'Finance': 'Finance',
  'Real Estate': 'Real Estate', 'RealEstate': 'Real Estate',
  'Basic Materials': 'Materials', 'Materials': 'Materials',
};

// Convert a watchlist array to the shape used by the research stocks list
function watchlistToResearchStocks(watchlist) {
  return watchlist.map((w, i) => ({
    id: w.id, ticker: w.symbol, ranking: i + 1,
    score: null, thesis: null, notes: null, _isWatchlist: true,
  }));
}

export function useSectorResearch(watchlist) {
  const savedSector = safeGet('uptik_last_sector');
  const [researchSector, setResearchSectorRaw]  = useState(savedSector || null);
  const [researchStocks, setResearchStocks]     = useState([]);
  const [researchLoading, setResearchLoading]   = useState(false);
  const [researchExpanded, setResearchExpanded] = useState(null);
  const [researchPrices, setResearchPrices]     = useState({});
  const [researchSectors, setResearchSectors]   = useState([]);
  const [showSectorDropdown, setShowSectorDropdown] = useState(false);

  // Persist sector selection to localStorage
  const setResearchSector = (val) => {
    setResearchSectorRaw(val);
    if (val) safeSet('uptik_last_sector', val);
    else safeRemove('uptik_last_sector');
  };

  // Close sector dropdown on outside click
  useEffect(() => {
    if (!showSectorDropdown) return;
    const handleClick = () => setShowSectorDropdown(false);
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [showSectorDropdown]);

  // When in __mylist__ mode and watchlist changes, auto-sync research stocks
  useEffect(() => {
    if (researchSector !== '__mylist__') return;
    setResearchStocks(watchlistToResearchStocks(watchlist));
  }, [watchlist, researchSector]);

  // Load available sectors on mount
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('curated_stocks').select('sector');
        if (error) throw error;
        if (data) {
          const unique = [...new Set(data.map(s => s.sector).filter(Boolean))];
          setResearchSectors(unique);
        }
      } catch (err) {
        console.error('[SectorResearch] Failed to load sectors:', err.message);
      }
    })();
  }, []);

  // Deduplicated, shortened sector labels for the dropdown
  const sectorLabels = (() => {
    const seen = new Set();
    return researchSectors
      .filter(sec => sec !== 'Auto' && sec !== 'ETF')
      .filter(sec => {
        const label = SHORT_SECTOR[sec] || sec;
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
      })
      .map(sec => SHORT_SECTOR[sec] || sec);
  })();

  const fetchResearchPrices = async (tickers) => {
    if (!tickers.length || !FMP_KEY) return;
    try {
      const results = await Promise.allSettled(
        tickers.map(t =>
          fetch(`https://financialmodelingprep.com/stable/quote?symbol=${t}&apikey=${FMP_KEY}`)
            .then(r => r.json())
        )
      );
      const prices = {};
      results.forEach(r => {
        if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value[0]) {
          const q = r.value[0];
          if (q.symbol && q.price) prices[q.symbol] = { price: q.price, change: q.changePercentage };
        }
      });
      setResearchPrices(prev => ({ ...prev, ...prices }));
    } catch (err) {
      console.error('[Research] Price fetch error:', err.message);
    }
  };

  const loadResearch = async (sector) => {
    setResearchSector(sector);
    setResearchLoading(true);
    setResearchExpanded(null);
    try {
      let query = supabase.from('curated_stocks').select('*');
      if (sector === 'All') {
        query = query.order('score', { ascending: false }).limit(15);
      } else {
        query = query.ilike('sector', `%${sector}%`).order('score', { ascending: false }).limit(15);
      }
      const { data: stocks } = await query;
      if (stocks?.length > 0) {
        const seen = {};
        stocks.forEach(s => {
          if (!seen[s.ticker] || s.score > seen[s.ticker].score) seen[s.ticker] = s;
        });
        const unique = Object.values(seen).sort((a, b) => b.score - a.score);
        const ranked = unique.map((s, i) => ({ ...s, ranking: i + 1 }));
        setResearchStocks(ranked);
        fetchResearchPrices(ranked.map(s => s.ticker));
      } else {
        setResearchStocks([]);
      }
    } catch (err) {
      console.error('[Research] Load error:', err.message);
      setResearchStocks([]);
    }
    setResearchLoading(false);
  };

  return {
    researchSector, setResearchSector,
    researchStocks, setResearchStocks,
    researchLoading,
    researchExpanded, setResearchExpanded,
    researchPrices,
    researchSectors,
    showSectorDropdown, setShowSectorDropdown,
    sectorLabels,
    loadResearch, fetchResearchPrices,
    watchlistToResearchStocks,
  };
}
