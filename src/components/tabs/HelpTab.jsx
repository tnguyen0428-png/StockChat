// ============================================
// UPTIKALERTS — HelpTab.jsx
// FAQ accordion organized by category
// ============================================

import { useState } from 'react';

const FAQ = [
  {
    category: 'Getting Started',
    items: [
      {
        q: 'What is UptikAlerts?',
        a: 'UptikAlerts is a mobile-first stock trading community app. It combines real-time market data, curated stock lists, group chat, and daily briefings so traders can stay informed and collaborate in one place.',
      },
      {
        q: 'How do I join a group chat?',
        a: 'From the Home tab, tap any sector card under "Sector Group Chat." You\'ll be automatically added as a member and taken to that group\'s chat.',
      },
      {
        q: 'What is a Private Chat?',
        a: 'A Private Chat is a smaller, invite-only group. If an admin has assigned you to one, it will appear under the Private Chat card on the Home tab. Tap it to open that chat.',
      },
      {
        q: 'How do I navigate the app?',
        a: 'Use the bottom navigation bar to switch between Home, Alerts, Help, and Profile. While inside a group chat, you\'ll see the chat header at the top — tap the UpTikAlerts logo to return to Home.',
      },
    ],
  },
  {
    category: 'Features',
    items: [
      {
        q: 'What is the Daily Briefing?',
        a: 'The Daily Briefing is a curated selection of market-moving news articles posted each morning by the admin. Each article shows the relevant tickers and a "Read →" link to the full story.',
      },
      {
        q: 'What are Curated Lists?',
        a: 'Curated Lists are ranked watchlists created by the group admin. You can find them inside a group chat under the Lists sub-tab. Each stock shows its ranking, ticker, and a score based on fundamentals and momentum.',
      },
      {
        q: 'What are Alerts?',
        a: 'Alerts are real-time broadcast notifications sent by moderators or the admin. They appear as a scrolling banner across the top of the screen and are color-coded: green for bullish, red for bearish, gold for watchlist, and blue for info.',
      },
      {
        q: 'What is the Watchlist?',
        a: 'Your personal Watchlist lives in the Chat tab under the Watchlist sub-tab. Add any ticker you want to track and view live quotes at a glance.',
      },
    ],
  },
  {
    category: 'Market Data',
    items: [
      {
        q: 'Where does the market data come from?',
        a: 'Live quotes, market pulse, top movers, and ticker banners are powered by the Polygon.io API. Data refreshes every 60 seconds during market hours.',
      },
      {
        q: 'Why are some prices showing "--"?',
        a: 'This usually means the market is closed or the ticker hasn\'t traded yet today. The app automatically falls back to the previous trading day\'s closing price when live data isn\'t available.',
      },
      {
        q: 'What do the Market Pulse and Top Movers strips show?',
        a: 'The Market Pulse strip at the top of the Home tab shows key indices and ETFs configured by the admin. The Top Movers strip shows today\'s top 5 gainers and losers by percentage change.',
      },
      {
        q: 'How is the stock screener score calculated?',
        a: 'The screener scores tickers across six factors: Earnings (30%), Fundamentals (25%), Sales Growth (20%), Valuation (10%), Price Trend (10%), and Market Cap (5%). Higher scores indicate stronger overall momentum and fundamentals.',
      },
    ],
  },
  {
    category: 'Account',
    items: [
      {
        q: 'How do I update my profile or sign out?',
        a: 'Tap the avatar icon in the top-right corner of the header to open your account menu. From there you can go to Profile Settings or sign out.',
      },
      {
        q: 'How do I become a moderator?',
        a: 'Moderator status is assigned by the group admin. Contact your admin if you believe you should have moderator access.',
      },
      {
        q: 'I\'m an admin — where is the admin panel?',
        a: 'The admin panel is in the Profile tab. Scroll to the bottom of the page to find sections for News Scanner, Run Screener, Post Briefing, Curated Lists, Manage Groups, and Manage Users.',
      },
      {
        q: 'How do I report a bug or give feedback?',
        a: 'Please reach out to your group admin directly. For technical issues with the platform, contact the development team.',
      },
    ],
  },
];

export default function HelpTab() {
  const [openKey, setOpenKey] = useState(null);

  const toggle = (key) => setOpenKey(prev => prev === key ? null : key);

  return (
    <div style={styles.scroll}>

      <div style={styles.hero}>
        <div style={styles.heroTitle}>Help & FAQ</div>
        <div style={styles.heroSub}>Everything you need to know about UptikAlerts</div>
      </div>

      {FAQ.map((section) => (
        <div key={section.category} style={styles.section}>
          <div style={styles.categoryLabel}>{section.category}</div>
          <div style={styles.card}>
            {section.items.map((item, i) => {
              const key = `${section.category}-${i}`;
              const isOpen = openKey === key;
              const isLast = i === section.items.length - 1;
              return (
                <div key={key}>
                  <div
                    style={{ ...styles.row, borderBottom: isLast && !isOpen ? 'none' : '1px solid var(--border)' }}
                    onClick={() => toggle(key)}
                  >
                    <span style={styles.question}>{item.q}</span>
                    <span style={{ ...styles.chevron, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                  </div>
                  {isOpen && (
                    <div style={{ ...styles.answer, borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ height: 32 }} />
    </div>
  );
}

const styles = {
  scroll: {
    flex: 1, overflowY: 'auto', padding: '0 0 12px',
    WebkitOverflowScrolling: 'touch',
  },
  hero: {
    padding: '20px 16px 16px',
  },
  heroTitle: {
    fontSize: 20, fontWeight: 700, color: 'var(--text1)', marginBottom: 4,
  },
  heroSub: {
    fontSize: 13, color: 'var(--text3)',
  },
  section: {
    marginBottom: 4,
  },
  categoryLabel: {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 1, color: 'var(--text2)',
    padding: '0 16px', margin: '12px 0 6px',
  },
  card: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 10, overflow: 'hidden', marginLeft: 12, marginRight: 12,
  },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '13px 14px', cursor: 'pointer', gap: 8,
    WebkitTapHighlightColor: 'transparent',
  },
  question: {
    fontSize: 13, fontWeight: 500, color: 'var(--text1)', lineHeight: 1.4, flex: 1,
  },
  chevron: {
    fontSize: 14, color: 'var(--text3)', flexShrink: 0,
    transition: 'transform 0.2s ease',
  },
  answer: {
    fontSize: 13, color: 'var(--text2)', lineHeight: 1.6,
    padding: '0 14px 14px',
  },
};
