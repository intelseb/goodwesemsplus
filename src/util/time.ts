export function timezoneOffsetHours(timeZone: string, at: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const offsetLabel =
    formatter.formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = offsetLabel.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  return hours + (hours < 0 ? -minutes : minutes) / 60;
}

/** GoodWe statisticsAndPreV2 uses a signed hour offset (Perth ≈ 8). */
export function goodweTimeZoneParam(timeZone: string, at: Date = new Date()): number {
  return Math.round(timezoneOffsetHours(timeZone, at));
}

export function formatInTimeZone(
  date: Date,
  timeZone: string,
  pattern: "yyyy-MM-dd" | "yyyy-MM-dd HH:mm:ss" | "yyyyMMdd" | "HH:mm",
): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const year = parts.year!;
  const month = parts.month!;
  const day = parts.day!;
  const hour = parts.hour!;
  const minute = parts.minute!;
  const second = parts.second!;

  switch (pattern) {
    case "yyyy-MM-dd":
      return `${year}-${month}-${day}`;
    case "yyyy-MM-dd HH:mm:ss":
      return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    case "yyyyMMdd":
      return `${year}${month}${day}`;
    case "HH:mm":
      return `${hour}:${minute}`;
  }
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

export function localDayWindow(
  timeZone: string,
  dayOffsetFromToday: number,
  now: Date = new Date(),
): { startTime: string; endTime: string; localDate: string } {
  const localToday = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const localDate = addCalendarDays(localToday, dayOffsetFromToday);
  return {
    localDate,
    startTime: `${localDate} 00:00:00`,
    endTime: `${localDate} 23:59:59`,
  };
}

export function backfillDayOffsets(days: number): number[] {
  if (days < 1) return [];
  const offsets: number[] = [];
  for (let daysAgo = days - 1; daysAgo >= 0; daysAgo -= 1) {
    offsets.push(daysAgo === 0 ? 0 : -daysAgo);
  }
  return offsets;
}

/** Past days only (excludes today) for one-time historical backfill. */
export function backfillPastDayOffsets(days: number): number[] {
  return backfillDayOffsets(days).filter((offset) => offset !== 0);
}

export function parseSemsDateTime(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second ?? "0"),
    ),
  );
}

export function pvoutputDateTimeFromLocal(
  localDateTime: string,
  timeZone: string,
): {
  date: string;
  time: string;
} | null {
  // SEMS timestamps are already in station-local wall time; do not shift by TZ again.
  const match = localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  void timeZone;
  return { date: `${year}${month}${day}`, time: `${hour}:${minute}` };
}
