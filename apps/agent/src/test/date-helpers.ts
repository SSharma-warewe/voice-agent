/** Returns the next Friday on or after `from` as YYYY-MM-DD (if Friday, returns the following Friday). */
export function resolveNextFriday(from: Date): string {
  const day = from.getDay();
  let daysUntil = (5 - day + 7) % 7;
  if (daysUntil === 0) {
    daysUntil = 7;
  }

  const result = new Date(from);
  result.setDate(result.getDate() + daysUntil);
  return result.toISOString().slice(0, 10);
}