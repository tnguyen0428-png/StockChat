import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const POLYGON_KEY = import.meta.env.VITE_POLYGON_API_KEY;

export function useWatchlist(session) {
  const [watchlist, setWatchlist]         = useState([]);
  const [showSearch, setShowSearch]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingTicker, setAddingTicker]   = useState(null);
  const [toast, setToast]                 = useState(null);
  const searchTimeout = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Returns the loaded data so the caller can coordinate initial research sync
  const loadWatchlist = async () => {
    try {
      const { data, error } = await supabase
        .from('user_watchlist')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      if (data) setWatchlist(data);
      return data;
    } catch (err) {
      console.error('[Watchlist] loadWatchlist failed:', err.message);
      return null;
    }
  };

  // Returns the new row so the caller can trigger fetchResearchPrices
  const addToWatchlist = async (symbol) => {
    const upper = symbol.toUpperCase().trim();
    if (!upper || watchlist.find(w => w.symbol === upper)) return null;
    setAddingTicker(upper);
    try {
      const { data, error } = await supabase
        .from('user_watchlist')
        .insert({ user_id: session.user.id, symbol: upper })
        .select()
        .single();
      if (error) { console.error('[Watchlist] addToWatchlist error:', error.message); return null; }
      if (data) {
        setWatchlist(prev => [...prev, data]);
        showToast(`${upper} added to My List`);
      }
      return data;
    } catch (err) {
      console.error('[Watchlist] addToWatchlist failed:', err.message);
      return null;
    } finally {
      setAddingTicker(null);
    }
  };

  const removeFromWatchlist = async (id, symbol) => {
    try {
      const { error } = await supabase.from('user_watchlist').delete().eq('id', id);
      if (error) { console.error('[Watchlist] removeFromWatchlist error:', error.message); return; }
      setWatchlist(prev => prev.filter(w => w.id !== id));
      showToast(`${symbol} removed`);
    } catch (err) {
      console.error('[Watchlist] removeFromWatchlist failed:', err.message);
    }
  };

  const searchTickers = useCallback(async (query) => {
    if (query.length < 1) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const upper = query.toUpperCase();
      const majorExchanges = new Set(['XNYS', 'XNAS', 'XASE']);
      const [exactRes, searchRes] = await Promise.all([
        fetch(`https://api.polygon.io/v3/reference/tickers?ticker=${upper}&active=true&apiKey=${POLYGON_KEY}`),
        fetch(`https://api.polygon.io/v3/reference/tickers?search=${query}&active=true&market=stocks&locale=us&limit=8&apiKey=${POLYGON_KEY}`),
      ]);
      const [exactData, searchData] = await Promise.all([exactRes.json(), searchRes.json()]);
      const filtered = (searchData.results || []).filter(t =>
        majorExchanges.has(t.primary_exchange)
      );
      const seen = new Set();
      const merged = [];
      for (const t of [...(exactData.results || []), ...filtered]) {
        if (!seen.has(t.ticker)) { seen.add(t.ticker); merged.push(t); }
      }
      setSearchResults(merged.slice(0, 6).map(t => ({
        symbol: t.ticker,
        name: t.name,
        alreadyAdded: watchlist.some(w => w.symbol === t.ticker),
      })));
    } catch (err) {
      console.error('[Watchlist] searchTickers failed:', err.message);
      setSearchResults([]);
    }
    setSearchLoading(false);
  }, [watchlist]);

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchTickers(val), 300);
  };

  return {
    watchlist, setWatchlist,
    showSearch, setShowSearch,
    searchQuery, setSearchQuery,
    searchResults, setSearchResults,
    searchLoading, addingTicker, toast,
    loadWatchlist, addToWatchlist, removeFromWatchlist,
    searchTickers, handleSearchChange, showToast,
  };
}
