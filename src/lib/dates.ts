export function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRollingWindow(): string[] {
  const now = new Date();
  // Anchor to UTC midnight so the calendar date matches UTC-based fake timers
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  const dates: string[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(todayUtc + i * 86400000);
    dates.push(formatDate(d));
  }
  return dates;
}

export function isWithinWindow(dateStr: string): boolean {
  const window = getRollingWindow();
  return window.includes(dateStr);
}
