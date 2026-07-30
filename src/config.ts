import { config as loadDotenv } from "dotenv";
import { resolveRegion, type RegionConfig } from "./sems/regions.js";
import type { DeviceDetail, StationDetail } from "./sems/types.js";

export type AppConfig = {
  region: RegionConfig;
  email: string;
  password: string;
  station: StationDetail;
  /** Optional device blob for live temp/voltage telemetry. */
  device?: DeviceDetail;
  pvoutputApi: string;
  pvoutputSystemId: string;
  pollIntervalMs: number;
  backfillDays: number;
  timeZone: string;
  logLevel: string;
};

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function decodeStationDetail(encoded: string): StationDetail {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error("STATION_DETAIL is not valid base64 JSON");
  }
  if (!json || typeof json !== "object") {
    throw new Error("STATION_DETAIL JSON must be an object");
  }
  const stationId = (json as { stationId?: unknown }).stationId;
  if (typeof stationId !== "string" || !stationId) {
    throw new Error("STATION_DETAIL.stationId is required");
  }
  const detail = json as {
    stationId: string;
    stationName?: unknown;
    stationType?: unknown;
    fromLogin?: unknown;
  };
  return {
    stationId: detail.stationId,
    stationName: typeof detail.stationName === "string" ? detail.stationName : undefined,
    stationType: typeof detail.stationType === "number" ? detail.stationType : undefined,
    fromLogin: typeof detail.fromLogin === "boolean" ? detail.fromLogin : undefined,
  };
}

export function decodeDeviceDetail(encoded: string): DeviceDetail {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error("DEVICE_DETAIL is not valid base64 JSON");
  }
  if (!json || typeof json !== "object") {
    throw new Error("DEVICE_DETAIL JSON must be an object");
  }
  const detail = json as {
    stationId?: unknown;
    deviceSn?: unknown;
    deviceType?: unknown;
    stationName?: unknown;
    timespan?: unknown;
    subtype?: unknown;
  };
  if (typeof detail.stationId !== "string" || !detail.stationId) {
    throw new Error("DEVICE_DETAIL.stationId is required");
  }
  if (typeof detail.deviceSn !== "string" || !detail.deviceSn) {
    throw new Error("DEVICE_DETAIL.deviceSn is required");
  }
  if (typeof detail.deviceType !== "string" || !detail.deviceType) {
    throw new Error("DEVICE_DETAIL.deviceType is required");
  }
  return {
    stationId: detail.stationId,
    deviceSn: detail.deviceSn,
    deviceType: detail.deviceType,
    stationName: typeof detail.stationName === "string" ? detail.stationName : undefined,
    timespan: typeof detail.timespan === "number" ? detail.timespan : undefined,
    subtype: typeof detail.subtype === "string" ? detail.subtype : undefined,
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, loadFile = true): AppConfig {
  if (loadFile) loadDotenv();

  const region = resolveRegion(requireEnv("SERVER", env));
  const timeZone = env.TIMEZONE?.trim() || region.defaultTimezone;
  const deviceRaw = env.DEVICE_DETAIL?.trim();

  return {
    region,
    email: requireEnv("EMAIL", env),
    password: requireEnv("PASSWORD", env),
    station: decodeStationDetail(requireEnv("STATION_DETAIL", env)),
    device: deviceRaw ? decodeDeviceDetail(deviceRaw) : undefined,
    pvoutputApi: requireEnv("PVOUTPUT_API", env),
    pvoutputSystemId: requireEnv("PVOUTPUT_SYSTEM_ID", env),
    pollIntervalMs: parsePositiveInt("POLL_INTERVAL_MS", env.POLL_INTERVAL_MS, 900_000),
    backfillDays: parsePositiveInt("BACKFILL_DAYS", env.BACKFILL_DAYS, 7),
    timeZone,
    logLevel: env.LOG_LEVEL?.trim() || "info",
  };
}
