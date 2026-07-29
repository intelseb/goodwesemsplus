import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DEVICE_ID_PATH = join(process.cwd(), ".data", "device-id");

/** Stable device uuid (SEMS+ stores this in localStorage as sems_device_id). */
export function getDeviceId(): string {
  try {
    if (existsSync(DEVICE_ID_PATH)) {
      const existing = readFileSync(DEVICE_ID_PATH, "utf8").trim();
      if (existing) return existing;
    }
  } catch {
    // fall through
  }
  const deviceId = randomUUID();
  try {
    mkdirSync(dirname(DEVICE_ID_PATH), { recursive: true });
    writeFileSync(DEVICE_ID_PATH, deviceId, "utf8");
  } catch {
    // in-memory only if filesystem unavailable
  }
  return deviceId;
}

export function buildTraceparent(): string {
  const randomHex = (byteCount: number) =>
    Array.from({ length: byteCount }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, "0"),
    ).join("");
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}
