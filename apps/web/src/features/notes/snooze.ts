export type SnoozePresets = { tomorrow: string; weekend: string; nextWeek: string };

const FRIDAY = 5;
const SUNDAY = 0;

/** `YYYY-MM-DD` + `days`. UTC math on the string, so DST cannot shift it. */
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days from `day` to the next `weekday` (0 = Sunday), always 1 to 7: never today. */
function daysUntil(day: string, weekday: number): number {
  const current = new Date(`${day}T00:00:00Z`).getUTCDay();
  return ((weekday - current + 6) % 7) + 1;
}

/** The quick "Not now" targets for `today`. Weekend = Friday (Israeli weekend), next week = Sunday. */
export function snoozePresets(today: string): SnoozePresets {
  return {
    tomorrow: addDays(today, 1),
    weekend: addDays(today, daysUntil(today, FRIDAY)),
    nextWeek: addDays(today, daysUntil(today, SUNDAY)),
  };
}

export const tomorrowOf = (today: string): string => addDays(today, 1);
