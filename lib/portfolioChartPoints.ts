/**
 * Chart shows: stored snapshot history (each point’s `date` is the day that snapshot represents, typically “yesterday”
 * when the job runs) plus **today** as the live collection total.
 */

/** UTC calendar date YYYY-MM-DD for “now”. */
export function utcTodayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * History from R2 + live total for today. Drops any file point dated “today” so it doesn’t duplicate the live dot.
 */
export function mergePortfolioHistoryWithLiveToday(
  points: { date: string; totalValueGbp: number }[],
  liveTotalGbp: number,
  now = new Date(),
): { date: string; totalValueGbp: number }[] {
  const today = utcTodayKey(now);
  const withoutToday = points.filter((p) => p.date !== today);
  const next = [...withoutToday, { date: today, totalValueGbp: liveTotalGbp }];
  next.sort((a, b) => a.date.localeCompare(b.date));
  return next;
}
