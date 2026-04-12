// ============================================
// UPTIKALERTS — OnboardingOverlay.jsx
// First-login onboarding flow: pick stocks to watch
// ============================================

import { ONBOARD_TRENDING, ONBOARD_SECTORS } from './homeConstants';

export default function OnboardingOverlay({
  OB, t,
  onboardSelected, toggleOnboardTicker,
  onboardSearch, handleOnboardSearch,
  onboardSearchResults, setOnboardSearch, setOnboardSearchResults,
  onboardSearchLoading,
  onboardPrices,
  finishOnboarding, skipOnboarding,
}) {
  return (
    <div style={OB.overlay}>
      {/* Welcome */}
      <div style={OB.header}>
        <div style={OB.wave}>👋</div>
        <div style={OB.title}>Welcome to UpTik!</div>
        <div style={OB.sub}>Pick some stocks to watch. You'll get live prices, alerts, and see what the community says about them.</div>
      </div>

      {/* Progress */}
      <div style={OB.progress}>
        <span style={OB.count}><span style={{ color: t.green }}>{onboardSelected.size}</span> selected</span>
        <div style={OB.barTrack}>
          <div style={{ ...OB.barFill, width: `${Math.min((onboardSelected.size / 5) * 100, 100)}%` }} />
        </div>
        <span style={{ fontSize: 11, color: t.text3 }}>min 1</span>
      </div>

      {/* Search */}
      <div style={OB.search}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.text3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          style={OB.searchInput}
          placeholder="Search any ticker or company..."
          value={onboardSearch}
          onChange={e => handleOnboardSearch(e.target.value)}
        />
        {onboardSearch && (
          <span style={{ color: t.text3, cursor: 'pointer', fontSize: 16 }} onClick={() => { setOnboardSearch(''); setOnboardSearchResults([]); }}>×</span>
        )}
      </div>

      {/* Search results */}
      {onboardSearchResults.length > 0 && (
        <div style={OB.searchResults}>
          {onboardSearchResults.map(r => (
            <div key={r.symbol} style={OB.searchItem}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text1 }}>{r.symbol}</div>
                <div style={{ fontSize: 10, color: t.text3 }}>{r.name}</div>
              </div>
              {onboardSelected.has(r.symbol) ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: t.green, padding: '4px 12px' }}>Added ✓</span>
              ) : (
                <button style={OB.searchAddBtn} onClick={() => toggleOnboardTicker(r.symbol)}>+ Add</button>
              )}
            </div>
          ))}
        </div>
      )}
      {onboardSearchLoading && <div style={{ padding: '8px 20px', fontSize: 11, color: t.text3 }}>Searching...</div>}

      {/* Scrollable picks area */}
      <div style={OB.scrollArea}>
        {/* Trending */}
        <div style={OB.section}>
          <div style={OB.sectionTitle}>
            <span style={{ fontSize: 14 }}>🔥</span> Trending Now
          </div>
          <div style={OB.trendingGrid}>
            {ONBOARD_TRENDING.map(item => {
              const sel = onboardSelected.has(item.symbol);
              const p = onboardPrices[item.symbol];
              const chg = p?.change;
              return (
                <div
                  key={item.symbol}
                  style={{ ...OB.trendingChip, ...(sel ? OB.trendingChipSel : {}) }}
                  onClick={() => toggleOnboardTicker(item.symbol)}
                >
                  <span style={OB.tcTicker}>{item.symbol}</span>
                  {chg != null && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: chg >= 0 ? '#1AAD5E' : 'var(--red)' }}>
                      {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                    </span>
                  )}
                  <span style={{ fontSize: sel ? 13 : 16, color: sel ? '#1AAD5E' : t.text3 }}>
                    {sel ? '✓' : '+'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sectors */}
        <div style={OB.section}>
          <div style={OB.sectionTitle}>
            <span style={{ fontSize: 14 }}>📊</span> Browse by Sector
          </div>
          {ONBOARD_SECTORS.map(sector => (
            <div key={sector.name} style={OB.sectorGroup}>
              <div style={OB.sectorLabel}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sector.color, display: 'inline-block' }} />
                {sector.name}
              </div>
              <div style={OB.sectorStocks}>
                {sector.tickers.map(ticker => {
                  const sel = onboardSelected.has(ticker);
                  return (
                    <div
                      key={ticker}
                      style={{ ...OB.sectorStock, ...(sel ? OB.sectorStockSel : {}) }}
                      onClick={() => toggleOnboardTicker(ticker)}
                    >
                      {ticker} <span style={{ fontSize: 13, color: sel ? '#1AAD5E' : '#c0c8d0' }}>{sel ? '✓' : '+'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer CTA */}
      <div style={OB.footer}>
        <button
          style={{ ...OB.cta, ...(onboardSelected.size === 0 ? { opacity: 0.5 } : {}) }}
          onClick={finishOnboarding}
          disabled={onboardSelected.size === 0}
        >
          Build My Watchlist{onboardSelected.size > 0 ? ` (${onboardSelected.size})` : ''} →
        </button>
        <div style={OB.skip} onClick={skipOnboarding}>Skip for now</div>
      </div>
    </div>
  );
}
