// ============================================
// UPTIKALERTS — ProfileTab.jsx
// User profile, settings, and admin panel
// ============================================

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { polyFetch } from '../../lib/polygonClient';
import { useGroup } from '../../context/GroupContext';
import { runScreener, SECTOR_MAP } from '../../lib/screener';
import { run52wHighScan, DEFAULT_THRESHOLD, runVolSurgeScan, DEFAULT_VOL_MULTIPLIER, runGapUpScan, DEFAULT_GAP_THRESHOLD, runMACrossScan, DEFAULT_SHORT_MA, DEFAULT_LONG_MA } from '../../lib/breakoutScanner';
import { runFlowScan } from '../../lib/institutionalFlow';
import RiskMeter from '../profile/RiskMeter';

// ── Admin Panel ──
function AdminPanel({ session, profile }) {
  const [activeSection, setActiveSection] = useState(null);

  // Groups state
  const [groups, setGroups]             = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSector, setNewGroupSector] = useState('');
  const [newGroupPublic, setNewGroupPublic] = useState(true);

  // Users state
  const [users, setUsers] = useState([]);

  // Briefing state
  const [briefingText, setBriefingText]       = useState('');
  const [briefingMood, setBriefingMood]       = useState('neutral');
  const [postingBriefing, setPostingBriefing] = useState(false);

  // Curated list state
  const [selectedGroup, setSelectedGroup] = useState('');
  const [listName, setListName]           = useState('');

  // Screener state
  const screenerGroupRef = useRef(null);
  const [screenerSector, setScreenerSector]     = useState('Tech');
  const [screenerGroup, setScreenerGroup]       = useState('');
  const [screenerRunning, setScreenerRunning]   = useState(false);
  const [screenerProgress, setScreenerProgress] = useState(0);
  const [screenerResults, setScreenerResults]   = useState([]);
  const [screenerSaved, setScreenerSaved]       = useState(false);

  // News Scanner state
  const [newsItems, setNewsItems]       = useState([]);
  const [newsLoading, setNewsLoading]   = useState(false);
  const [selectedNews, setSelectedNews] = useState([]);
  const [postingNews, setPostingNews]   = useState(false);

  // Alert Scanner state
  const [scanning52w, setScanning52w] = useState(false);
  const [scan52wProgress, setScan52wProgress] = useState(0);
  const [scan52wStatus, setScan52wStatus] = useState(null);
  const [scanningVol, setScanningVol] = useState(false);
  const [scanVolProgress, setScanVolProgress] = useState(0);
  const [scanVolStatus, setScanVolStatus] = useState(null);
  const [scanningGap, setScanningGap] = useState(false);
  const [scanGapProgress, setScanGapProgress] = useState(0);
  const [scanGapStatus, setScanGapStatus] = useState(null);
  const [scanningMA, setScanningMA] = useState(false);
  const [scanMAProgress, setScanMAProgress] = useState(0);
  const [scanMAStatus, setScanMAStatus] = useState(null);
  const [scanningAll, setScanningAll] = useState(false);
  const [scanAllProgress, setScanAllProgress] = useState('');
  const [scanningFlow, setScanningFlow] = useState(false);
  const [scanFlowStatus, setScanFlowStatus] = useState(null);

  const isAnyScanRunning = scanning52w || scanningVol || scanningGap || scanningMA || scanningAll || scanningFlow;

  const handle52wScan = async () => {
    setScanning52w(true); setScan52wProgress(0); setScan52wStatus(null);
    try { const { inserted } = await run52wHighScan(DEFAULT_THRESHOLD, setScan52wProgress); setScan52wStatus({ inserted }); }
    catch (e) { setScan52wStatus({ error: e.message }); }
    finally { setScanning52w(false); }
  };
  const handleVolScan = async () => {
    setScanningVol(true); setScanVolProgress(0); setScanVolStatus(null);
    try { const { inserted } = await runVolSurgeScan(DEFAULT_VOL_MULTIPLIER, setScanVolProgress); setScanVolStatus({ inserted }); }
    catch (e) { setScanVolStatus({ error: e.message }); }
    finally { setScanningVol(false); }
  };
  const handleGapScan = async () => {
    setScanningGap(true); setScanGapProgress(0); setScanGapStatus(null);
    try { const { inserted } = await runGapUpScan(DEFAULT_GAP_THRESHOLD, setScanGapProgress); setScanGapStatus({ inserted }); }
    catch (e) { setScanGapStatus({ error: e.message }); }
    finally { setScanningGap(false); }
  };
  const handleMAScan = async () => {
    setScanningMA(true); setScanMAProgress(0); setScanMAStatus(null);
    try { const { inserted } = await runMACrossScan(DEFAULT_SHORT_MA, DEFAULT_LONG_MA, setScanMAProgress); setScanMAStatus({ inserted }); }
    catch (e) { setScanMAStatus({ error: e.message }); }
    finally { setScanningMA(false); }
  };
  const handleFlowScan = async () => {
    setScanningFlow(true); setScanFlowStatus(null);
    try {
      const result = await runFlowScan();
      const inserted = result?.inserted ?? 0;
      setScanFlowStatus({ inserted });
      // Re-flag featured after flow data comes in
      await flagFeaturedAlerts();
    } catch (e) {
      setScanFlowStatus({ error: e.message || 'Flow scan failed' });
    } finally {
      setScanningFlow(false);
    }
  };

  // ── Auto-flag top 4 alerts of the day as "featured" for History tab ──
  const flagFeaturedAlerts = async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Fetch all of today's alerts — rank client-side since confidence is computed
      const { data: todayAlerts, error: fetchErr } = await supabase
        .from('breakout_alerts')
        .select('id, ticker, signal_type, volume_ratio, change_pct, pct_from_high, gap_pct, rel_volume')
        .gte('created_at', todayStart.toISOString());

      if (fetchErr) { console.error('[Featured] Fetch error:', fetchErr.message); return; }
      if (!todayAlerts || todayAlerts.length === 0) return;

      // Compute a simple "strength" score per alert (mirrors mapDbAlert confidence logic)
      const scored = todayAlerts.map(a => {
        let score = 70; // base
        if (a.volume_ratio > 2) score += 10;
        if (a.volume_ratio > 3) score += 5;
        if (a.pct_from_high != null && a.pct_from_high < 2) score += 10;
        if (a.pct_from_high != null && a.pct_from_high < 1) score += 5;
        if (a.change_pct != null && Math.abs(a.change_pct) > 3) score += 5;
        if (a.gap_pct != null && a.gap_pct > 3) score += 5;
        if (a.rel_volume > 5) score += 10;
        if (a.signal_type === 'flow_signal') score += 5; // prioritize flow signals
        return { ...a, score };
      }).sort((a, b) => b.score - a.score);

      // Deduplicate by ticker — keep highest score per ticker
      const seen = new Set();
      const unique = [];
      for (const a of scored) {
        if (!seen.has(a.ticker)) {
          seen.add(a.ticker);
          unique.push(a);
        }
      }

      // Top 4 become featured
      const topIds = unique.slice(0, 4).map(a => a.id);

      // Clear any previous featured flags for today, then set new ones
      const { data: allToday } = await supabase
        .from('breakout_alerts')
        .select('id')
        .gte('created_at', todayStart.toISOString())
        .eq('featured', true);

      if (allToday && allToday.length > 0) {
        const clearIds = allToday.map(a => a.id);
        await supabase.from('breakout_alerts').update({ featured: false }).in('id', clearIds);
      }

      // Flag the top 4
      if (topIds.length > 0) {
        await supabase.from('breakout_alerts').update({ featured: true }).in('id', topIds);
      }

      console.log(`[Featured] Flagged ${topIds.length} alerts:`, unique.slice(0, 4).map(a => a.ticker));
    } catch (e) {
      console.error('[Featured] Error flagging alerts:', e.message);
    }
  };

  const handleScanAll = async () => {
    setScanningAll(true);
    // Clear all previous statuses and progress
    setScan52wStatus(null); setScanVolStatus(null); setScanGapStatus(null); setScanMAStatus(null);
    setScan52wProgress(0); setScanVolProgress(0); setScanGapProgress(0); setScanMAProgress(0);

    try {
      setScanAllProgress('⚡ 52W High…');
      setScanning52w(true);
      try { const { inserted } = await run52wHighScan(DEFAULT_THRESHOLD, setScan52wProgress); setScan52wStatus({ inserted }); }
      catch (e) { setScan52wStatus({ error: e.message }); }
      finally { setScanning52w(false); }

      setScanAllProgress('🔥 Vol Surge…');
      setScanningVol(true);
      try { const { inserted } = await runVolSurgeScan(DEFAULT_VOL_MULTIPLIER, setScanVolProgress); setScanVolStatus({ inserted }); }
      catch (e) { setScanVolStatus({ error: e.message }); }
      finally { setScanningVol(false); }

      setScanAllProgress('📈 Gap Up…');
      setScanningGap(true);
      try { const { inserted } = await runGapUpScan(DEFAULT_GAP_THRESHOLD, setScanGapProgress); setScanGapStatus({ inserted }); }
      catch (e) { setScanGapStatus({ error: e.message }); }
      finally { setScanningGap(false); }

      setScanAllProgress('🔀 MA Cross…');
      setScanningMA(true);
      try { const { inserted } = await runMACrossScan(DEFAULT_SHORT_MA, DEFAULT_LONG_MA, setScanMAProgress); setScanMAStatus({ inserted }); }
      catch (e) { setScanMAStatus({ error: e.message }); }
      finally { setScanningMA(false); }

      // After all scans, flag top 4 as featured for History
      setScanAllProgress('⭐ Flagging top alerts…');
      await flagFeaturedAlerts();

    } finally {
      // Always clean up — even if something unexpected happens
      setScanningAll(false);
      setScanAllProgress('');
    }
  };

  useEffect(() => {
    if (activeSection === 'groups')   loadGroups();
    if (activeSection === 'users')    loadUsers();
    if (activeSection === 'briefing') loadGroups();
    if (activeSection === 'lists')    loadGroups();
    if (activeSection === 'screener') loadGroups();
    if (activeSection === 'news')     fetchNews();
  }, [activeSection]);

  const loadGroups = async () => {
    const { data } = await supabase.from('groups').select('*').order('created_at');
    if (data) setGroups(data);
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, group_members(role, group_id, groups(name))')
      .order('created_at');
    if (data) setUsers(data);
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    await supabase.from('groups').insert({
      name: newGroupName.trim(), is_public: newGroupPublic,
      sector: newGroupSector.trim() || null,
    });
    setNewGroupName(''); setNewGroupSector('');
    await loadGroups();
  };

  const deleteGroup = async (id) => {
    if (!window.confirm('Delete this group?')) return;
    await supabase.from('groups').delete().eq('id', id);
    await loadGroups();
  };

  const promoteUser = async (userId, groupId) => {
    await supabase.from('group_members').update({ role: 'moderator' }).eq('user_id', userId).eq('group_id', groupId);
    await loadUsers();
  };

  const removeUser = async (userId, groupId) => {
    if (!window.confirm('Remove this user?')) return;
    await supabase.from('group_members').delete().eq('user_id', userId).eq('group_id', groupId);
    await loadUsers();
  };

  const postBriefing = async () => {
    if (!briefingText.trim() || postingBriefing) return;
    setPostingBriefing(true);
    await supabase.from('daily_briefings').insert({ content: briefingText.trim(), mood: briefingMood, tags: [] });
    setBriefingText(''); setPostingBriefing(false);
    alert('Briefing posted!');
  };

  const createCuratedList = async () => {
    if (!selectedGroup || !listName.trim()) return;
    await supabase.from('curated_lists').insert({ group_id: selectedGroup, name: listName.trim() });
    setListName('');
    alert('Curated list created!');
  };

  const handleRunScreener = async () => {
    const matchingGroup = groups.find(g => g.name === screenerSector);
    if (!matchingGroup) { alert(`No group found for ${screenerSector}. Please create it first.`); return; }
    const groupId = matchingGroup.id;
    screenerGroupRef.current = groupId;
    setScreenerGroup(groupId);
    setScreenerRunning(true); setScreenerProgress(0);
    setScreenerResults([]); setScreenerSaved(false);
    try {
      const results = await runScreener(screenerSector, (pct) => setScreenerProgress(pct));
      setScreenerResults(results);
      console.log('Screener results:', results.length, 'Group ID:', groupId);
    } catch (e) {
      setScreenerResults([]);
      alert('Screener error: ' + e.message);
    } finally {
      setScreenerRunning(false);
    }
  };

  const handleSaveResults = async () => {
    const groupId = screenerGroupRef.current || screenerGroup;
    console.log('Saving to group:', groupId, 'sector:', screenerSector, 'results:', screenerResults.length);
    if (!screenerResults.length || !groupId) { alert('No group selected.'); return; }
    let { data: list } = await supabase
      .from('curated_lists').select('*')
      .eq('group_id', groupId).eq('name', `Top 15 ${screenerSector}`).maybeSingle();
    if (!list) {
      const { data: newList } = await supabase
        .from('curated_lists').insert({ group_id: groupId, name: `Top 15 ${screenerSector}`, sector: screenerSector })
        .select().single();
      list = newList;
    }
    if (!list) { alert('Could not create list.'); return; }
    const { error: delErr } = await supabase.from('curated_stocks').delete().eq('list_id', list.id);
    if (delErr) {
      console.error('[Screener] Delete error:', delErr.message);
      alert('Failed to clear old data: ' + delErr.message);
      return;
    }
    const rows = screenerResults.map((r, i) => ({
      list_id: list.id, ticker: r.symbol, ranking: i + 1, score: r.score, sector: screenerSector,
      thesis: r.thesis,
      notes: `P/E: ${r.pe?.toFixed(1) || 'N/A'} · PEG: ${r.peg?.toFixed(2) || 'N/A'} · Net Margin: ${r.netMargin ? (r.netMargin * 100).toFixed(1) + '%' : 'N/A'} · Sales Growth: ${r.salesGrowth != null ? r.salesGrowth + '%' : 'N/A'} · EPS Growth: ${r.epsGrowth != null ? r.epsGrowth + '%' : 'N/A'} · Beat Rate: ${r.beatRate != null ? r.beatRate + '%' : 'N/A'}`,
    }));
    const { error } = await supabase.from('curated_stocks').insert(rows);
    if (error) {
      console.error('[Screener] Save error:', error.message);
      alert('Failed to save: ' + error.message);
      return;
    }
    setScreenerSaved(true);
    setActiveSection(null);
  };

  const fetchNews = async () => {
    setNewsLoading(true);
    setSelectedNews([]);
    try {
      const data = await polyFetch(`/v2/reference/news?limit=20`);
      const FILTER_OUT = [
        // Class action / legal spam
        'class action', 'securities fraud', 'securities litigation', 'law firm',
        'lawsuit investigation', 'reminds investors', 'reminds shareholders',
        'legal action', 'filed a lawsuit', 'seeks damages',
        // Insider selling (keep insider buying)
        'insider selling', 'insiders sell', 'insider sold', 'executives sell',
        'ceo sells', 'cfo sells', 'officer sells', 'director sells',
        // Sponsored / PR fluff
        'press release', 'sponsored content', 'paid promotion', 'advertorial',
        'business wire', 'globe newswire', 'accesswire', 'prnewswire',
        // Penny stock pump
        'penny stock', 'could 10x', 'next big thing', 'hidden gem stock',
        'under the radar stock', 'microcap alert', 'hot stock pick',
        'stock to watch before it explodes', 'massive upside potential',
        // Crypto
        'bitcoin', 'ethereum', 'crypto', 'cryptocurrency', 'blockchain',
        'defi', 'nft', 'altcoin', 'memecoin', 'solana', 'dogecoin',
        'shiba inu', 'cardano', 'web3', 'token sale',
        // Dividends
        'dividend announcement', 'dividend record date', 'ex-dividend',
        'dividend declared', 'dividend increase', 'dividend cut',
        'dividend yield', 'dividend payout',
        // Listicles / clickbait
        'top stocks to buy', 'best stocks to buy', 'stocks to buy now',
        'top picks for', 'best investments for', 'stocks you should buy',
        'hot stocks for', 'must-buy stocks',
      ];
      const filtered = (data.results || []).filter(item => {
        const text = `${item.title} ${item.description || ''}`.toLowerCase();
        return !FILTER_OUT.some(keyword => text.includes(keyword));
      });
      setNewsItems(filtered);
    } catch (e) {
      console.error('[News Scanner] Fetch error:', e.message);
      setNewsItems([]);
    }
    setNewsLoading(false);
  };

  const postNewsBriefing = async () => {
    if (!selectedNews.length || postingNews) return;
    setPostingNews(true);
    const articles = selectedNews.map(id => {
      const item = newsItems.find(n => n.id === id);
      return item ? {
        title: item.title,
        tickers: item.tickers?.slice(0,3) || [],
        url: item.article_url,
        publisher: item.publisher?.name || '',
        time: item.published_utc,
      } : null;
    }).filter(Boolean);

    const content = articles.map(a => `• ${a.title} (${a.tickers.join(', ')})`).join('\n');

    await supabase.from('daily_briefings').insert({
      content,
      mood: 'neutral',
      tags: articles.map(a => ({ title: a.title, url: a.url, tickers: a.tickers, publisher: a.publisher, time: a.time })),
    });
    setSelectedNews([]);
    setPostingNews(false);
    alert('Briefing posted!');
  };

  const sections = [
    { id: 'news',     label: 'News Scanner'  },
    { id: 'alertscanner', label: 'Alert Scanner' },
    { id: 'screener', label: 'Stock Scanner'  },
    { id: 'briefing', label: 'Post Briefing' },
    { id: 'lists',    label: 'Curated Lists' },
    { id: 'groups',   label: 'Manage Groups' },
    { id: 'users',    label: 'Manage Users'  },
  ];

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={adminStyles.secLabel}>Admin Panel</div>
      {sections.map(s => (
        <div key={s.id} style={adminStyles.accordion}>
          <div style={adminStyles.accordionHeader} onClick={() => setActiveSection(activeSection === s.id ? null : s.id)}>
            <span style={adminStyles.accordionLabel}>{s.label}</span>
            <span style={adminStyles.accordionArrow}>{activeSection === s.id ? '▲' : '▼'}</span>
          </div>

          {activeSection === s.id && (
            s.id === 'alertscanner' ? (
              <div style={adminStyles.body}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                  Scans S&P 500 + Nasdaq 100 for breakout signals. Results appear in the Alerts tab.
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  {/* Manual — runs all 4 client-side scanners (admin on-demand only) */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      style={{ ...adminStyles.btn, width: '100%', fontSize: 14, background: scanningAll ? 'var(--border)' : '#1a3c2a', opacity: isAnyScanRunning && !scanningAll ? 0.4 : 1 }}
                      onClick={handleScanAll} disabled={isAnyScanRunning}
                    >
                      {scanningAll ? `🔧 Manual… ${scanAllProgress}` : '🔧 Manual'}
                    </button>
                    <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.5, padding: '0 2px' }}>
                      ⚡ 52W High (5%)<br/>
                      🔥 Vol Surge (2x)<br/>
                      📈 Gap Up (1.5%)<br/>
                      🔀 MA Cross (9/21)
                    </div>
                  </div>
                  {/* Auto — UW flow scanner (scheduled 3x/day + on-demand) */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      style={{ ...adminStyles.btn, width: '100%', fontSize: 14, background: scanningFlow ? 'var(--border)' : '#4a3520', opacity: isAnyScanRunning && !scanningFlow ? 0.4 : 1 }}
                      onClick={handleFlowScan} disabled={isAnyScanRunning}
                    >
                      {scanningFlow ? '💰 Auto…' : '💰 Auto'}
                    </button>
                    <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.5, padding: '0 2px' }}>
                      🐋 Dark Pool Trades<br/>
                      📊 Options Flow<br/>
                      🏦 $3B+ Market Cap<br/>
                      🔁 8am · 10am · 1pm PT
                    </div>
                  </div>
                </div>
                {/* Progress indicator — visible while any scan is running */}
                {(scanningAll || scanningFlow) && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                        {scanningAll
                          ? `Scanning… ${scanAllProgress || '⚡ 52W High…'}`
                          : 'Scanning… 💰 Flow Data'}
                      </span>
                      {scanningAll && (
                        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
                          {Math.round((scan52wProgress / 4) + (scanVolProgress / 4) + (scanGapProgress / 4) + (scanMAProgress / 4))}%
                        </span>
                      )}
                    </div>
                    {scanningAll && (
                      <div style={adminStyles.progressBar}>
                        <div style={{ ...adminStyles.progressFill, width: `${Math.round((scan52wProgress / 4) + (scanVolProgress / 4) + (scanGapProgress / 4) + (scanMAProgress / 4))}%` }} />
                      </div>
                    )}
                    {scanningFlow && (
                      <div style={adminStyles.progressBar}>
                        <div style={{ ...adminStyles.progressFill, width: '100%', animation: 'flowPulse 2s ease-in-out infinite' }} />
                      </div>
                    )}
                  </div>
                )}
                {/* Manual scan results */}
                {scan52wStatus && <div style={{ fontSize: 12, color: scan52wStatus.error ? 'var(--red)' : 'var(--green)', marginBottom: 4 }}>{scan52wStatus.error ? `Error: ${scan52wStatus.error}` : scan52wStatus.inserted === 0 ? '⚡ 52W — no new breakouts' : `⚡ 52W — ${scan52wStatus.inserted} alert${scan52wStatus.inserted > 1 ? 's' : ''} added`}</div>}
                {scanVolStatus && <div style={{ fontSize: 12, color: scanVolStatus.error ? 'var(--red)' : 'var(--green)', marginBottom: 4 }}>{scanVolStatus.error ? `Error: ${scanVolStatus.error}` : scanVolStatus.inserted === 0 ? '🔥 Vol — no surges found' : `🔥 Vol — ${scanVolStatus.inserted} alert${scanVolStatus.inserted > 1 ? 's' : ''} added`}</div>}
                {scanGapStatus && <div style={{ fontSize: 12, color: scanGapStatus.error ? 'var(--red)' : 'var(--green)', marginBottom: 4 }}>{scanGapStatus.error ? `Error: ${scanGapStatus.error}` : scanGapStatus.inserted === 0 ? '📈 Gap — no gaps found' : `📈 Gap — ${scanGapStatus.inserted} alert${scanGapStatus.inserted > 1 ? 's' : ''} added`}</div>}
                {scanMAStatus && <div style={{ fontSize: 12, color: scanMAStatus.error ? 'var(--red)' : 'var(--green)', marginBottom: 4 }}>{scanMAStatus.error ? `Error: ${scanMAStatus.error}` : scanMAStatus.inserted === 0 ? '🔀 MA — no crossovers found' : `🔀 MA — ${scanMAStatus.inserted} alert${scanMAStatus.inserted > 1 ? 's' : ''} added`}</div>}
                {/* Auto scan result */}
                {scanFlowStatus && <div style={{ fontSize: 12, color: scanFlowStatus.error ? 'var(--red)' : 'var(--green)', marginBottom: 4 }}>{scanFlowStatus.error ? `Error: ${scanFlowStatus.error}` : scanFlowStatus.inserted === 0 ? '💰 Big Money — no flow signals found' : `💰 Big Money — ${scanFlowStatus.inserted} alert${scanFlowStatus.inserted > 1 ? 's' : ''} added`}</div>}
              </div>
            ) : s.id === 'screener' ? (
              <div style={adminStyles.body}>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 10, marginBottom: 10 }}>
                  Scores top stocks from S&P 500 + Nasdaq 100 by sector using FMP data.
                </div>
                <div style={adminStyles.row}>
                  <select style={adminStyles.select} value={screenerSector} onChange={e => setScreenerSector(e.target.value)}>
                    {Object.keys(SECTOR_MAP).filter(s => s !== 'General').map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <button
                  style={{ ...adminStyles.btn, width: '100%', marginTop: 10, opacity: screenerRunning ? 0.6 : 1 }}
                  onClick={handleRunScreener} disabled={screenerRunning}
                >
                  {screenerRunning ? `Scanning... ${screenerProgress}%` : `Run ${screenerSector} Screener`}
                </button>
                {screenerRunning && (
                  <div style={adminStyles.progressBar}>
                    <div style={{ ...adminStyles.progressFill, width: `${screenerProgress}%` }} />
                  </div>
                )}
                {screenerResults.length > 0 && (
                  <>
                    <div style={{ ...adminStyles.secLabel, marginTop: 14 }}>Top {screenerResults.length} {screenerSector} Stocks</div>
                    {screenerResults.map((r, i) => (
                      <div key={r.symbol} style={adminStyles.listRow}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={adminStyles.rank}>#{i + 1}</span>
                            <span style={adminStyles.listName}>{r.symbol}</span>
                            <span style={adminStyles.scoreTag}>{r.score}</span>
                          </div>
                          <div style={adminStyles.listSub}>P/E {r.pe?.toFixed(1) || 'N/A'} · PEG {r.peg?.toFixed(2) || 'N/A'} · Beat {r.beatRate}%</div>
                          <div style={adminStyles.thesisText}>{r.thesis}</div>
                        </div>
                      </div>
                    ))}
                    <button
                      style={{ ...adminStyles.btn, width: '100%', marginTop: 12, background: screenerSaved ? '#888' : 'var(--green)' }}
                      onClick={handleSaveResults} disabled={screenerSaved}
                    >
                      {screenerSaved ? 'Saved!' : 'Save to Curated List'}
                    </button>
                  </>
                )}
              </div>
            ) : s.id === 'briefing' ? (
              <div style={adminStyles.body}>
                <select style={{ ...adminStyles.select, marginTop: 10 }} value={briefingMood} onChange={e => setBriefingMood(e.target.value)}>
                  <option value="neutral">Neutral</option>
                  <option value="risk-on">Risk On</option>
                  <option value="risk-off">Risk Off</option>
                </select>
                <textarea style={adminStyles.textarea} placeholder="Write today's pre-market briefing..." value={briefingText} onChange={e => setBriefingText(e.target.value)} rows={5} />
                <button style={{ ...adminStyles.btn, width: '100%', opacity: postingBriefing || !briefingText.trim() ? 0.6 : 1 }} onClick={postBriefing} disabled={postingBriefing || !briefingText.trim()}>
                  {postingBriefing ? 'Posting...' : 'Post Briefing'}
                </button>
              </div>
            ) : s.id === 'lists' ? (
              <div style={adminStyles.body}>
                <select style={{ ...adminStyles.select, marginTop: 10 }} value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                  <option value="">Select group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <div style={adminStyles.row}>
                  <input style={adminStyles.input} placeholder="List name" value={listName} onChange={e => setListName(e.target.value)} />
                  <button style={adminStyles.btn} onClick={createCuratedList}>Create</button>
                </div>
              </div>
            ) : s.id === 'groups' ? (
              <div style={adminStyles.body}>
                <div style={adminStyles.row}>
                  <input style={adminStyles.input} placeholder="Group name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
                  <input style={{ ...adminStyles.input, width: 90 }} placeholder="Sector" value={newGroupSector} onChange={e => setNewGroupSector(e.target.value)} />
                </div>
                <div style={{ ...adminStyles.row, marginBottom: 10 }}>
                  <div style={{ ...adminStyles.toggle, background: newGroupPublic ? 'var(--green)' : 'var(--border)' }} onClick={() => setNewGroupPublic(p => !p)}>
                    <div style={{ ...adminStyles.knob, left: newGroupPublic ? 'auto' : 3, right: newGroupPublic ? 3 : 'auto' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{newGroupPublic ? 'Public' : 'Private'}</span>
                  <button style={adminStyles.btn} onClick={createGroup}>Create</button>
                </div>
                {groups.map(g => (
                  <div key={g.id} style={adminStyles.listRow}>
                    <div>
                      <div style={adminStyles.listName}>{g.name}</div>
                      <div style={adminStyles.listSub}>{g.is_public ? 'Public' : 'Private'}{g.sector ? ` · ${g.sector}` : ''}</div>
                    </div>
                    <button style={adminStyles.removeBtn} onClick={() => deleteGroup(g.id)}>Delete</button>
                  </div>
                ))}
              </div>
            ) : s.id === 'news' ? (
              <div style={adminStyles.body}>
                <button style={{ ...adminStyles.btn, width: '100%', marginTop: 10, opacity: newsLoading ? 0.6 : 1 }} onClick={fetchNews} disabled={newsLoading}>
                  {newsLoading ? 'Loading...' : 'Refresh News'}
                </button>
                <div style={{ maxHeight: 400, overflowY: 'auto', WebkitOverflowScrolling: 'touch', marginTop: 8 }}>
                  {newsItems.map(item => (
                    <div key={item.id}
                      style={{ ...adminStyles.listRow, background: selectedNews.includes(item.id) ? 'var(--green-bg)' : 'transparent', borderRadius: 8, padding: '10px 8px', cursor: 'pointer' }}
                      onClick={() => setSelectedNews(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text1)', lineHeight: 1.4 }}>{item.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
                          {item.tickers?.slice(0,5).join(', ')} · {new Date(item.published_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, background: selectedNews.includes(item.id) ? 'var(--green)' : 'var(--card2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedNews.includes(item.id) && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedNews.length > 0 && (
                  <button style={{ ...adminStyles.btn, width: '100%', marginTop: 10, opacity: postingNews ? 0.6 : 1 }} onClick={postNewsBriefing} disabled={postingNews}>
                    {postingNews ? 'Posting...' : `Post ${selectedNews.length} article${selectedNews.length > 1 ? 's' : ''} as briefing`}
                  </button>
                )}
              </div>
            ) : s.id === 'users' ? (
              <div style={adminStyles.body}>
                {users.map(u => (
                  <div key={u.id} style={adminStyles.listRow}>
                    <div style={{ flex: 1 }}>
                      <div style={adminStyles.listName}>{u.username}</div>
                      <div style={adminStyles.listSub}>{u.group_members?.map(gm => `${gm.groups?.name} (${gm.role})`).join(', ') || 'No groups'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {u.group_members?.filter(gm => gm.role !== 'moderator' && gm.role !== 'admin').map(gm => (
                        <button key={`mod_${gm.group_id}`} style={adminStyles.promoteBtn} onClick={() => promoteUser(u.id, gm.group_id)}>Mod</button>
                      ))}
                      {u.group_members?.map(gm => (
                        <button key={`rm_${gm.group_id}`} style={adminStyles.removeBtn} onClick={() => removeUser(u.id, gm.group_id)}>Remove</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main ProfileTab ──
export default function ProfileTab({ session, profile, group, isAdmin, onSignOut }) {
  const { refreshGroups } = useGroup();
  const [notifications, setNotifications] = useState({ alerts: true, briefing: true, broadcasts: true, chat: false });
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notif_prefs')
        .eq('id', session.user.id)
        .single();
      if (data?.notif_prefs) setNotifications(data.notif_prefs);
    })();
  }, [session?.user?.id]);

  const copyInviteLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/join/${group?.invite_code}`).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const handleToggle = async (key) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    await supabase
      .from('profiles')
      .update({ notif_prefs: updated })
      .eq('id', session.user.id);
  };

  const saveUsername = async () => {
    if (!newUsername.trim() || !session?.user?.id || savingName) return;
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: newUsername.trim() })
      .eq('id', session.user.id);
    if (!error) {
      await refreshGroups();
      setEditingName(false);
    }
    setSavingName(false);
    document.activeElement?.blur();
  };

  const formatDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div style={styles.scroll}>
      <div style={styles.profileCard}>
        <div style={styles.avatarWrap}>
          <div style={{ ...styles.avatar, color: profile?.color || 'var(--green)', borderColor: (profile?.color || 'var(--green)') + '40' }}>
            {profile?.username?.[0]?.toUpperCase() || '?'}
          </div>
        </div>
        <div style={styles.profileInfo}>
          <div style={styles.profileName}>{profile?.username || 'Trader'}</div>
          <div style={styles.profileEmail}>{session?.user?.email}</div>
          <div style={styles.profileBadges}>
            {isAdmin && <span style={styles.badgeAdmin}>Admin</span>}
            {group?.name && <span style={styles.badgeGroup}>{group.name}</span>}
            {profile?.created_at && <span style={styles.badgeMember}>Since {formatDate(profile.created_at)}</span>}
          </div>
        </div>
      </div>

      <RiskMeter session={session} />

      {isAdmin && <AdminPanel session={session} profile={profile} />}

      {group && (
        <>
          <div style={styles.secLabel}>My Group</div>
          <div style={styles.groupCard}>
            <div style={styles.groupTop}>
              <div style={styles.groupName}>{group.name}</div>
              {isAdmin && <span style={styles.modBadge}>Moderator</span>}
            </div>
            <button style={styles.inviteBtn} onClick={copyInviteLink}>{copied ? 'Copied!' : 'Copy Invite Link'}</button>
            {group.invite_code && <div style={styles.inviteLink}>{window.location.origin}/join/{group.invite_code}</div>}
          </div>
        </>
      )}

      <div style={styles.secLabel}>Notifications</div>
      <div style={styles.settingsCard}>
        {[{ key: 'alerts', label: 'Breakout Alerts' }, { key: 'briefing', label: 'Daily Briefing' }, { key: 'broadcasts', label: 'Admin Broadcasts' }, { key: 'chat', label: 'Chat Messages' }].map((item, i, arr) => (
          <div key={item.key} style={{ ...styles.settingRow, borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <span style={styles.settingLabel}>{item.label}</span>
            <div style={{ ...styles.toggle, background: notifications[item.key] ? 'var(--green)' : 'var(--border)' }} onClick={() => handleToggle(item.key)}>
              <div style={{ ...styles.toggleKnob, left: notifications[item.key] ? 'auto' : 3, right: notifications[item.key] ? 3 : 'auto' }} />
            </div>
          </div>
        ))}
      </div>

      <div style={styles.secLabel}>Account</div>
      <div style={styles.settingsCard}>
        <div style={{ ...styles.settingRow, borderBottom: '1px solid var(--border)' }}>
          {editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <input
                style={styles.nameInput}
                value={newUsername}
                onChange={e => setNewUsername(e.target.value.slice(0, 20))}
                placeholder="New name"
                autoFocus
                maxLength={20}
                onKeyDown={e => e.key === 'Enter' && saveUsername()}
                enterKeyHint="done"
              />
              <button style={styles.nameSaveBtn} onClick={saveUsername} disabled={savingName}>
                {savingName ? '..' : 'Save'}
              </button>
              <button style={styles.nameCancelBtn} onClick={() => { setEditingName(false); document.activeElement?.blur(); }}>✕</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer' }}
              onClick={() => { setEditingName(true); setNewUsername(profile?.username || ''); }}>
              <span style={styles.settingLabel}>Trader Name</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={styles.settingValue}>{profile?.username || 'Trader'}</span>
                <span style={{ fontSize: 10, color: '#3B6D11', fontWeight: 500 }}>edit</span>
              </div>
            </div>
          )}
        </div>
        <div style={styles.settingRow}>
          <span style={styles.settingLabel}>Email</span>
          <span style={styles.settingValue}>{session?.user?.email?.split('@')[0] + '...'}</span>
        </div>
      </div>

      <div style={styles.secLabel}>Account Actions</div>
      <button style={styles.signOutBtn} onClick={onSignOut}>Sign Out</button>
      <div style={{ height: 20 }} />
    </div>
  );
}

// NOTE: stub styles reconstructed after a file truncation. Polish to taste.
const styles = {
  scroll:        { padding: 16, paddingBottom: 80, overflowY: 'auto', height: '100%' },
  profileCard:   { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16 },
  avatarWrap:    { flexShrink: 0 },
  avatar:        { width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, background: 'var(--card2)', border: '2px solid var(--green)' },
  profileInfo:   { flex: 1, minWidth: 0 },
  profileName:   { fontSize: 16, fontWeight: 600, color: 'var(--text1)' },
  profileEmail:  { fontSize: 12, color: 'var(--text3)', marginTop: 2 },
  profileBadges: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badgeAdmin:    { fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--green)', color: '#fff', fontWeight: 600 },
  badgeGroup:    { fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--card2)', color: 'var(--text2)', border: '1px solid var(--border)' },
  badgeMember:   { fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--card2)', color: 'var(--text3)', border: '1px solid var(--border)' },
  secLabel:      { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', padding: '0 4px', margin: '14px 0 8px' },
  groupCard:     { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 16 },
  groupTop:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  groupName:     { fontSize: 15, fontWeight: 600, color: 'var(--text1)' },
  modBadge:      { fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--green)', color: '#fff', fontWeight: 600 },
  inviteBtn:     { width: '100%', background: 'var(--green)', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  inviteLink:    { fontSize: 11, color: 'var(--text3)', marginTop: 8, wordBreak: 'break-all' },
  settingsCard:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
  settingRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px' },
  settingLabel:  { fontSize: 13, color: 'var(--text1)' },
  settingValue:  { fontSize: 13, color: 'var(--text3)' },
  toggle:        { width: 36, height: 20, borderRadius: 12, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' },
  toggleKnob:    { position: 'absolute', top: 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s, right 0.2s' },
  nameInput:     { flex: 1, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text1)', outline: 'none' },
  nameSaveBtn:   { background: 'var(--green)', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 6 },
  nameCancelBtn: { background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginLeft: 6 },
  signOutBtn:    { width: '100%', background: 'transparent', color: '#EF4444', border: '1px solid #EF4444', padding: '12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 16 },
};

const adminStyles = {
  secLabel: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text3)', padding: '0 4px', margin: '14px 0 8px' },
  accordion: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 6, overflow: 'hidden' },
  accordionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px', cursor: 'pointer' },
  accordionLabel: { fontSize: 14, fontWeight: 500, color: 'var(--text1)' },
  accordionArrow: { fontSize: 11, color: 'var(--text3)' },
  body: { padding: '0 14px 14px', borderTop: '1px solid var(--border)' },
  row: { display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' },
  input: { flex: 1, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text1)', outline: 'none', boxSizing: 'border-box' },
  select: { flex: 1, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text1)', boxSizing: 'border-box' },
  textarea: { width: '100%', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text1)', resize: 'none', lineHeight: 1.6, fontFamily: 'var(--font)', marginTop: 10, boxSizing: 'border-box' },
  btn: { background: 'var(--green)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  listRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 10 },
  listName: { fontSize: 13, fontWeight: 600, color: 'var(--text1)' },
  listSub: { fontSize: 11, color: 'var(--text3)', marginTop: 2 },
  thesisText: { fontSize: 11, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 },
  progressBar: { width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', background: 'var(--green)', borderRadius: 3, transition: 'width 0.3s ease' },
};
