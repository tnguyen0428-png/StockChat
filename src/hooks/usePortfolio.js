import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { FMP_KEY, STARTING_CASH } from '../lib/constants';

export function usePortfolio(session) {
  const [portfolio, setPortfolio]           = useState(null);
  const [trades, setTrades]                 = useState([]);
  const [prices, setPrices]                 = useState({});
  const [lastUpdated, setLastUpdated]       = useState(null);
  const [loadingData, setLoadingData]       = useState(true);
  const [sellTrade, setSellTrade]           = useState(null);
  const [closedTrades, setClosedTrades]     = useState([]);
  const [showHistory, setShowHistory]       = useState(false);

  // Inline buy state
  const [searchQuery, setSearchQuery]       = useState('');
  const [searchResults, setSearchResults]   = useState([]);
  const [searching, setSearching]           = useState(false);
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [showPresets, setShowPresets]       = useState(false);
  const [customAmount, setCustomAmount]     = useState('');
  const [showCustom, setShowCustom]         = useState(false);
  const [buyError, setBuyError]             = useState('');
  const [buying, setBuying]                 = useState(false);

  const searchTimer = useRef(null);
  const mountedRef  = useRef(true);
  const refreshRef  = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Load portfolio ──
  const loadPortfolio = useCallback(async () => {
    if (!session?.user?.id) return;

    // Check if portfolio already exists BEFORE calling ensure_paper_portfolio
    // This prevents the RPC from potentially resetting an existing portfolio
    const { data: existingPf } = await supabase
      .from('paper_portfolios')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!existingPf) {
      await supabase.rpc('ensure_paper_portfolio');
    }

    const [{ data: pf }, { data: openTrades }] = await Promise.all([
      supabase.from('paper_portfolios').select('*').eq('user_id', session.user.id).single(),
      supabase.from('paper_trades').select('*').eq('user_id', session.user.id).eq('status', 'open'),
    ]);

    // Safety check: if portfolio exists but cash_balance got reset to starting amount
    // while user has trade history, something went wrong — log it
    if (pf && existingPf && Number(pf.cash_balance) === STARTING_CASH && Number(existingPf.cash_balance) !== STARTING_CASH) {
      console.error('[Challenge] POSSIBLE DATA RESET DETECTED — cash_balance was', existingPf.cash_balance, 'now', pf.cash_balance);
      await supabase.from('paper_portfolios')
        .update({ cash_balance: existingPf.cash_balance })
        .eq('user_id', session.user.id);
      pf.cash_balance = existingPf.cash_balance;
    }

    setPortfolio(pf);
    setTrades(openTrades || []);
    setLoadingData(false);
    if (openTrades?.length > 0) {
      const tickers = [...new Set(openTrades.map(t => t.ticker))].join(',');
      await fetchPrices(tickers);
    }
  }, [session?.user?.id]);

  const fetchPrices = async (tickers) => {
    if (!tickers) return;
    try {
      // FMP plan only supports single symbol per request — fetch individually
      const symbols = tickers.split(',').map(s => s.trim()).filter(Boolean);
      const map = {};
      for (let i = 0; i < symbols.length; i += 6) {
        const batch = symbols.slice(i, i + 6);
        await Promise.all(batch.map(async (sym) => {
          try {
            const res = await fetch(`https://financialmodelingprep.com/stable/quote-short?symbol=${sym}&apikey=${FMP_KEY}`);
            const data = await res.json();
            if (Array.isArray(data) && data[0]?.price) {
              map[data[0].symbol] = data[0].price;
            }
          } catch (err) {
            console.error('[Portfolio] fetchPrices single ticker failed:', sym, err.message);
          }
        }));
        if (i + 6 < symbols.length) await new Promise(r => setTimeout(r, 250));
      }
      if (Object.keys(map).length > 0 && mountedRef.current) {
        setPrices(prev => ({ ...prev, ...map }));
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('[Portfolio] fetchPrices failed:', err.message);
    }
  };

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  // Refresh prices every 30s
  useEffect(() => {
    if (trades.length === 0) return;
    refreshRef.current = setInterval(() => {
      const tickers = [...new Set(trades.map(t => t.ticker))].join(',');
      fetchPrices(tickers);
    }, 30000);
    return () => clearInterval(refreshRef.current);
  }, [trades]);

  const loadClosedTrades = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data, error } = await supabase
      .from('paper_trades')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('status', 'closed')
      .order('sold_at', { ascending: false })
      .limit(20);
    if (error) console.error('[Portfolio] loadClosedTrades failed:', error.message);
    if (data) setClosedTrades(data);
  }, [session?.user?.id]);

  useEffect(() => { loadClosedTrades(); }, [loadClosedTrades]);

  // ── Search (debounced) ──
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) { setSearchResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(searchQuery)}&limit=5&apikey=${FMP_KEY}`
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          setSearchResults(data.filter(d => {
            const ex = (d.exchangeShortName || d.exchange || '').toUpperCase();
            return ex.includes('NYSE') || ex.includes('NASDAQ');
          }));
        }
      } catch (err) {
        console.error('[Portfolio] search failed:', err.message);
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  // ── Select ticker from search ──
  const handleSelectTicker = async (item) => {
    setBuyError('');
    setSearchResults([]);
    setSearchQuery('');
    try {
      const res = await fetch(
        `https://financialmodelingprep.com/stable/quote-short?symbol=${item.symbol}&apikey=${FMP_KEY}`
      );
      const data = await res.json();
      const price = Array.isArray(data) && data[0] ? data[0].price : null;
      if (!price) { setBuyError("Couldn't fetch price. Try again."); return; }
      setSelectedTicker({ symbol: item.symbol, name: item.name, price });
      setShowPresets(true);
      setShowCustom(false);
      setCustomAmount('');
    } catch (err) {
      console.error('[Portfolio] handleSelectTicker failed:', err.message);
      setBuyError("Couldn't fetch price. Try again.");
    }
  };

  // ── Buy — accepts optional afterBuy callback for post-buy refreshes ──
  const executeBuy = async (dollarAmount, afterBuy) => {
    const currentCash = Number(portfolio?.cash_balance || 0);
    if (!selectedTicker?.price || dollarAmount <= 0 || buying) return;
    if (dollarAmount > currentCash) {
      setBuyError(`Exceeds cash ($${currentCash.toLocaleString()})`);
      return;
    }
    setBuying(true);
    setBuyError('');
    const shares = dollarAmount / selectedTicker.price;
    try {
      // Fetch fresh cash balance to prevent race condition (stale React state)
      const { data: pf, error: pfErr } = await supabase
        .from('paper_portfolios')
        .select('cash_balance')
        .eq('user_id', session.user.id)
        .single();
      if (pfErr) throw pfErr;
      const freshCash = Number(pf.cash_balance);
      if (dollarAmount > freshCash) {
        setBuyError(`Insufficient funds ($${freshCash.toLocaleString()} available)`);
        setBuying(false);
        return;
      }

      // Check for existing open position in same ticker
      const { data: existingTrade } = await supabase
        .from('paper_trades')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('ticker', selectedTicker.symbol)
        .eq('status', 'open')
        .maybeSingle();

      let tradeId;
      if (existingTrade) {
        const oldShares  = Number(existingTrade.shares);
        const oldPrice   = Number(existingTrade.entry_price);
        const oldDollar  = Number(existingTrade.dollar_amount);
        const newShares  = oldShares + shares;
        const newAvgPrice = ((oldPrice * oldShares) + (selectedTicker.price * shares)) / newShares;
        const newDollar  = oldDollar + dollarAmount;
        const { error: mergeErr } = await supabase
          .from('paper_trades')
          .update({ shares: newShares, entry_price: newAvgPrice, dollar_amount: newDollar })
          .eq('id', existingTrade.id);
        if (mergeErr) throw mergeErr;
        tradeId = existingTrade.id;
      } else {
        const { data: trade, error: insertErr } = await supabase.from('paper_trades').insert({
          user_id: session.user.id,
          ticker: selectedTicker.symbol,
          shares,
          dollar_amount: dollarAmount,
          entry_price: selectedTicker.price,
          status: 'open',
          bought_at: new Date().toISOString(),
        }).select('id').single();
        if (insertErr) throw insertErr;
        tradeId = trade.id;
      }

      const { error: updateErr } = await supabase
        .from('paper_portfolios')
        .update({ cash_balance: freshCash - dollarAmount })
        .eq('user_id', session.user.id);
      if (updateErr) {
        if (!existingTrade) {
          await supabase.from('paper_trades').delete().eq('id', tradeId);
        } else {
          await supabase.from('paper_trades').update({
            shares: existingTrade.shares,
            entry_price: existingTrade.entry_price,
            dollar_amount: existingTrade.dollar_amount,
          }).eq('id', existingTrade.id);
        }
        throw updateErr;
      }
      setSelectedTicker(null);
      setShowPresets(false);
      setShowCustom(false);
      setCustomAmount('');
      await loadPortfolio();
      if (afterBuy) await afterBuy();
    } catch (err) {
      setBuyError(err.message || 'Failed to buy.');
    } finally {
      setBuying(false);
    }
  };

  const clearSelection = () => {
    setSelectedTicker(null);
    setShowPresets(false);
    setShowCustom(false);
    setCustomAmount('');
    setBuyError('');
  };

  const onSellComplete = () => {
    setSellTrade(null);
    loadPortfolio();
    loadClosedTrades();
  };

  // ── Computed values ──
  const totalPositionsValue = useMemo(() => trades.reduce((sum, t) => {
    const curPrice = prices[t.ticker] || Number(t.entry_price);
    return sum + (Number(t.shares) * curPrice);
  }, 0), [trades, prices]);
  const cashBalance = Number(portfolio?.cash_balance || 0);
  const totalValue  = cashBalance + totalPositionsValue;
  const totalReturn = ((totalValue - STARTING_CASH) / STARTING_CASH) * 100;
  const isPositive  = totalReturn >= 0;

  return {
    portfolio, trades, prices, lastUpdated, loadingData,
    sellTrade, setSellTrade,
    closedTrades, showHistory, setShowHistory,
    searchQuery, setSearchQuery,
    searchResults, searching,
    selectedTicker,
    showPresets, setShowPresets,
    customAmount, setCustomAmount,
    showCustom, setShowCustom,
    buyError, buying,
    loadPortfolio, fetchPrices, loadClosedTrades,
    handleSelectTicker, executeBuy, clearSelection, onSellComplete,
    totalPositionsValue, cashBalance, totalValue, totalReturn, isPositive,
  };
}
