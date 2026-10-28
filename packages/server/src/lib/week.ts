/**
 * Semana do ranking semanal: de segunda 00:00 a domingo 23:59:59 no horário
 * de Brasília (UTC-3, sem horário de verão desde 2019).
 */
export const WEEK_TZ_OFFSET_MIN = -180;
const DAY = 86_400_000;

export interface WeekWindow {
  start: Date;
  end: Date;
}

export function weekWindow(now: Date = new Date(), offsetMin = WEEK_TZ_OFFSET_MIN): WeekWindow {
  const shift = offsetMin * 60_000;
  const local = new Date(now.getTime() + shift); // campos UTC = horário local
  const dow = (local.getUTCDay() + 6) % 7; // segunda = 0
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow);
  const start = new Date(startLocal - shift);
  return { start, end: new Date(start.getTime() + 7 * DAY) };
}

export function previousWeek(w: WeekWindow): WeekWindow {
  return { start: new Date(w.start.getTime() - 7 * DAY), end: w.start };
}
