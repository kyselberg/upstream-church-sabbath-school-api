export function isSaturday(dateStr: string): boolean {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay() === 6;
}

export function saturdaysBetween(start: string, end: string): string[] {
  const d = new Date(`${start}T00:00:00Z`);
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  const saturdays: string[] = [];

  while (d.getTime() <= endMs) {
    if (d.getUTCDay() === 6) saturdays.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return saturdays;
}
