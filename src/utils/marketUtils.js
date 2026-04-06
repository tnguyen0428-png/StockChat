const US_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
];

function getEastern() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

export function isWeekend() {
  const day = getEastern().getDay();
  return day === 0 || day === 6;
}

export function isMarketHoliday() {
  const dateStr = getEastern().toISOString().slice(0, 10);
  return US_HOLIDAYS_2026.includes(dateStr);
}

export function isMarketOpen() {
  if (isWeekend() || isMarketHoliday()) return false;
  const est = getEastern();
  const mins = est.getHours() * 60 + est.getMinutes();
  return mins >= 570 && mins < 960; // 9:30 AM – 4:00 PM ET
}

export function isAfterHours() {
  if (isWeekend() || isMarketHoliday()) return false;
  const est = getEastern();
  const mins = est.getHours() * 60 + est.getMinutes();
  // Pre-market: 4:00 AM – 9:30 AM ET (240–570)
  // After-hours: 4:00 PM – 8:00 PM ET (960–1200)
  return (mins >= 240 && mins < 570) || (mins >= 960 && mins < 1200);
}
