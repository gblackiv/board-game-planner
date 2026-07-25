export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRollingWindow(): string[] {
  const now = new Date();

  const dates: string[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

export function isWithinWindow(dateStr: string): boolean {
  const window = getRollingWindow();
  return window.includes(dateStr);
}
