import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { PvStatus } from "../sems/types.js";
import { log } from "./logger.js";

export type UploadState = {
  stationId: string;
  /** Local calendar dates (yyyy-MM-dd) fully uploaded for historical backfill. */
  completedDates: string[];
};

export function getUploadStatePath(cwd = process.cwd()): string {
  return join(cwd, ".data", "upload-state.json");
}

export function getPendingDir(cwd = process.cwd()): string {
  return join(cwd, ".data", "pending");
}

function pendingPath(localDate: string, cwd = process.cwd()): string {
  return join(getPendingDir(cwd), `${localDate}.json`);
}

function emptyState(stationId: string): UploadState {
  return { stationId, completedDates: [] };
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

export function loadUploadState(stationId: string, path = getUploadStatePath()): UploadState {
  try {
    if (!existsSync(path)) {
      const fresh = emptyState(stationId);
      saveUploadState(fresh, path);
      log.info("Created upload state file", { path });
      return fresh;
    }
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<UploadState> & {
      pendingByDate?: unknown;
    };
    if (parsed.stationId !== stationId) {
      log.info("Upload state station changed — starting fresh historical tracking", {
        previous: parsed.stationId,
        stationId,
        path,
      });
      const fresh = emptyState(stationId);
      saveUploadState(fresh, path);
      return fresh;
    }
    const completedDates = Array.isArray(parsed.completedDates)
      ? parsed.completedDates.filter((date): date is string => typeof date === "string")
      : [];
    return { stationId, completedDates };
  } catch (error) {
    log.warn("Could not read upload state — keeping file, starting with empty completedDates", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    // Do not overwrite a corrupt/partial file here — that would erase completedDates.
    return emptyState(stationId);
  }
}

export function saveUploadState(state: UploadState, path = getUploadStatePath()): void {
  const uniqueSorted = [...new Set(state.completedDates)].sort();
  state.completedDates = uniqueSorted;
  writeJsonAtomic(path, { stationId: state.stationId, completedDates: uniqueSorted });
}

export function isDateCompleted(state: UploadState, localDate: string): boolean {
  return state.completedDates.includes(localDate);
}

function parseStatuses(value: unknown): PvStatus[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PvStatus => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return typeof row.date === "string" && typeof row.time === "string";
  });
}

export function getPendingStatuses(localDate: string, cwd = process.cwd()): PvStatus[] | undefined {
  const path = pendingPath(localDate, cwd);
  try {
    if (!existsSync(path)) return undefined;
    const statuses = parseStatuses(JSON.parse(readFileSync(path, "utf8")));
    return statuses.length > 0 ? statuses : undefined;
  } catch (error) {
    log.warn("Could not read pending day cache", {
      localDate,
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

export function savePendingDay(localDate: string, statuses: PvStatus[], cwd = process.cwd()): void {
  const path = pendingPath(localDate, cwd);
  writeJsonAtomic(path, statuses);
  log.info("Cached SEMS historical day — will not re-fetch from SEMS", {
    localDate,
    statuses: statuses.length,
    path,
  });
}

export function clearPendingDay(localDate: string, cwd = process.cwd()): void {
  const path = pendingPath(localDate, cwd);
  if (!existsSync(path)) return;
  unlinkSync(path);
}

export function markDateCompleted(
  state: UploadState,
  localDate: string,
  path = getUploadStatePath(),
): void {
  clearPendingDay(localDate);
  if (!state.completedDates.includes(localDate)) {
    state.completedDates.push(localDate);
  }
  saveUploadState(state, path);
  log.info("Marked historical date complete", {
    localDate,
    path,
    completedDates: [...state.completedDates].sort(),
  });
}
