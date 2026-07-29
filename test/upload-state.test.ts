import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backfillPastDayOffsets } from "../src/util/time.js";
import {
  getPendingStatuses,
  isDateCompleted,
  loadUploadState,
  markDateCompleted,
  savePendingDay,
  saveUploadState,
} from "../src/util/upload-state.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("backfillPastDayOffsets", () => {
  it("excludes today", () => {
    expect(backfillPastDayOffsets(3)).toEqual([-2, -1]);
    expect(backfillPastDayOffsets(1)).toEqual([]);
  });
});

describe("upload state", () => {
  it("creates state file on first load", () => {
    const dir = mkdtempSync(join(tmpdir(), "goodwe-state-"));
    tempDirs.push(dir);
    const path = join(dir, "upload-state.json");

    const state = loadUploadState("station-a", path);
    expect(state.completedDates).toEqual([]);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).stationId).toBe("station-a");
  });

  it("persists completed dates per station", () => {
    const dir = mkdtempSync(join(tmpdir(), "goodwe-state-"));
    tempDirs.push(dir);
    const path = join(dir, "upload-state.json");

    const state = loadUploadState("station-a", path);
    markDateCompleted(state, "2026-07-28", path);
    markDateCompleted(state, "2026-07-29", path);

    const reloaded = loadUploadState("station-a", path);
    expect(isDateCompleted(reloaded, "2026-07-28")).toBe(true);
    expect(isDateCompleted(reloaded, "2026-07-29")).toBe(true);
    expect(isDateCompleted(reloaded, "2026-07-30")).toBe(false);
    expect(JSON.parse(readFileSync(path, "utf8")).completedDates).toEqual([
      "2026-07-28",
      "2026-07-29",
    ]);

    const other = loadUploadState("station-b", path);
    expect(other.completedDates).toEqual([]);
  });

  it("caches pending SEMS days separately and clears them when completed", () => {
    const dir = mkdtempSync(join(tmpdir(), "goodwe-state-"));
    tempDirs.push(dir);
    const statePath = join(dir, "upload-state.json");

    const prev = process.cwd();
    process.chdir(dir);
    try {
      const state = loadUploadState("station-a", statePath);
      savePendingDay("2026-07-28", [
        { date: "20260728", time: "10:00", v2: 100 },
        { date: "20260728", time: "10:15", v2: 120 },
      ]);

      expect(getPendingStatuses("2026-07-28")).toHaveLength(2);
      expect(isDateCompleted(state, "2026-07-28")).toBe(false);
      expect(JSON.parse(readFileSync(statePath, "utf8")).completedDates).toEqual([]);

      markDateCompleted(state, "2026-07-28", statePath);
      expect(isDateCompleted(state, "2026-07-28")).toBe(true);
      expect(getPendingStatuses("2026-07-28")).toBeUndefined();
      expect(JSON.parse(readFileSync(statePath, "utf8")).completedDates).toEqual(["2026-07-28"]);
    } finally {
      process.chdir(prev);
    }
  });

  it("does not wipe completedDates when state JSON is corrupt", () => {
    const dir = mkdtempSync(join(tmpdir(), "goodwe-state-"));
    tempDirs.push(dir);
    const path = join(dir, "upload-state.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ not json", "utf8");

    const state = loadUploadState("station-a", path);
    expect(state.completedDates).toEqual([]);
    expect(readFileSync(path, "utf8")).toContain("not json");
  });

  it("writes sorted unique dates", () => {
    const dir = mkdtempSync(join(tmpdir(), "goodwe-state-"));
    tempDirs.push(dir);
    const path = join(dir, "upload-state.json");
    saveUploadState(
      {
        stationId: "s1",
        completedDates: ["2026-07-29", "2026-07-28", "2026-07-29"],
      },
      path,
    );
    const raw = JSON.parse(readFileSync(path, "utf8")) as { completedDates: string[] };
    expect(raw.completedDates).toEqual(["2026-07-28", "2026-07-29"]);
  });
});
