const units = [
  { unit: "year", seconds: 365 * 24 * 60 * 60 },
  { unit: "month", seconds: 30 * 24 * 60 * 60 },
  { unit: "week", seconds: 7 * 24 * 60 * 60 },
  { unit: "day", seconds: 24 * 60 * 60 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "minute", seconds: 60 },
] as const satisfies {
  unit: Intl.RelativeTimeFormatUnit;
  seconds: number;
}[];

const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function formatRelativeTime(date: Date, now: Date = new Date()) {
  const elapsed = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(elapsed);
  for (const { unit, seconds } of units) {
    if (abs >= seconds) {
      return formatter.format(Math.trunc(elapsed / seconds), unit);
    }
  }
  return "just now";
}

export function formatEdited(date: Date, now?: Date) {
  return `Edited ${formatRelativeTime(date, now)}`;
}
