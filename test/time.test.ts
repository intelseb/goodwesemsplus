import { describe, expect, it } from "vitest";
import {
  backfillDayOffsets,
  formatInTimeZone,
  goodweTimeZoneParam,
  localDayWindow,
  pvoutputDateTimeFromLocal,
} from "../src/util/time.js";

describe("backfillDayOffsets", () => {
  it("returns oldest-first including today", () => {
    expect(backfillDayOffsets(3)).toEqual([-2, -1, 0]);
    expect(backfillDayOffsets(1)).toEqual([0]);
    expect(backfillDayOffsets(0)).toEqual([]);
  });
});

describe("localDayWindow", () => {
  it("builds start/end for today", () => {
    const w = localDayWindow("Australia/Perth", 0, new Date("2026-07-29T08:00:00Z"));
    expect(w.startTime).toBe(`${w.localDate} 00:00:00`);
    expect(w.endTime).toBe(`${w.localDate} 23:59:59`);
  });
});

describe("pvoutputDateTimeFromLocal", () => {
  it("parses SEMS local timestamps", () => {
    expect(pvoutputDateTimeFromLocal("2026-07-29 14:05:00", "Australia/Perth")).toEqual({
      date: "20260729",
      time: "14:05",
    });
  });
});

describe("goodweTimeZoneParam", () => {
  it("returns integer hour offset", () => {
    const offset = goodweTimeZoneParam("Australia/Perth", new Date("2026-01-15T00:00:00Z"));
    expect(offset).toBe(8);
  });
});

describe("formatInTimeZone", () => {
  it("formats yyyyMMdd", () => {
    const s = formatInTimeZone(new Date("2026-07-29T04:00:00Z"), "UTC", "yyyyMMdd");
    expect(s).toBe("20260729");
  });
});
