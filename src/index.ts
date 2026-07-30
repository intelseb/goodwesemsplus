import { loadConfig, type AppConfig } from "./config.js";
import { SemsClient } from "./sems/client.js";
import type { PvStatus } from "./sems/types.js";
import { fetchDayStatistics } from "./poll/historical.js";
import { fetchLiveFlow } from "./poll/live.js";
import { mapHistoricalPoints, mapLiveFlow } from "./poll/map.js";
import { fetchEquipmentTelemetry } from "./poll/telemetry.js";
import { PvOutputClient, PvOutputRateLimitError } from "./pvoutput/client.js";
import { backfillPastDayOffsets, localDayWindow } from "./util/time.js";
import {
  getPendingStatuses,
  getUploadStatePath,
  isDateCompleted,
  loadUploadState,
  markDateCompleted,
  savePendingDay,
  type UploadState,
} from "./util/upload-state.js";

import { configureLogger, log } from "./util/logger.js";

type DayUploadResult = {
  localDate: string;
  statuses: number;
  uploaded: number;
  complete: boolean;
};

async function uploadStatuses(
  pv: PvOutputClient,
  localDate: string,
  statuses: PvStatus[],
  points: number,
): Promise<DayUploadResult> {
  log.debug("Uploading day statuses to PVOutput", {
    localDate,
    statusCount: statuses.length,
  });
  const uploaded = await pv.addBatchStatus(statuses);
  const remaining = statuses.filter((status) => !pv.hasUploaded(status)).length;
  const complete = remaining === 0;
  log.info("Day upload", {
    localDate,
    points,
    statuses: statuses.length,
    uploaded,
    remaining,
    complete,
  });
  return {
    localDate,
    statuses: statuses.length,
    uploaded,
    complete,
  };
}

async function uploadDay(
  sems: SemsClient,
  pv: PvOutputClient,
  config: AppConfig,
  dayOffset: number,
): Promise<DayUploadResult> {
  const window = localDayWindow(config.timeZone, dayOffset);
  log.debug("Fetching day statistics", {
    dayOffset,
    localDate: window.localDate,
    startTime: window.startTime,
    endTime: window.endTime,
  });
  const points = await fetchDayStatistics(
    sems,
    config.station.stationId,
    window.startTime,
    window.endTime,
    config.timeZone,
  );
  const statuses = mapHistoricalPoints(points, config.timeZone);
  return uploadStatuses(pv, window.localDate, statuses, points.length);
}

async function uploadPastDay(
  sems: SemsClient,
  pv: PvOutputClient,
  config: AppConfig,
  dayOffset: number,
): Promise<DayUploadResult> {
  const window = localDayWindow(config.timeZone, dayOffset);
  const cached = getPendingStatuses(window.localDate);
  if (cached) {
    log.info("Using cached SEMS historical day — skipping SEMS retrieve", {
      localDate: window.localDate,
      statuses: cached.length,
    });
    return uploadStatuses(pv, window.localDate, cached, cached.length);
  }

  log.debug("Fetching day statistics", {
    dayOffset,
    localDate: window.localDate,
    startTime: window.startTime,
    endTime: window.endTime,
  });
  const points = await fetchDayStatistics(
    sems,
    config.station.stationId,
    window.startTime,
    window.endTime,
    config.timeZone,
  );
  const statuses = mapHistoricalPoints(points, config.timeZone);
  // Persist immediately so a later restart never re-hits SEMS for this past day.
  savePendingDay(window.localDate, statuses);
  return uploadStatuses(pv, window.localDate, statuses, points.length);
}

async function pollOnce(sems: SemsClient, pv: PvOutputClient, config: AppConfig): Promise<void> {
  log.debug("Poll tick start");

  // Live first (with inverter temp/voltage) so it isn't skipped after today's
  // historical batch marks the same HH:mm as already uploaded.
  try {
    const flow = await fetchLiveFlow(sems, config.station.stationId);
    if (config.device) {
      try {
        const telemetry = await fetchEquipmentTelemetry(sems, {
          deviceSn: config.device.deviceSn,
          deviceType: config.device.deviceType,
          stationId: config.device.stationId || config.station.stationId,
        });
        if (telemetry.tempC !== undefined) flow.temp = telemetry.tempC;
        if (telemetry.voltageV !== undefined) flow.voltage = telemetry.voltageV;
      } catch (error) {
        log.warn("Equipment telemetry failed — live upload without temp/voltage", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      log.debug("No DEVICE_DETAIL — live upload without temp/voltage");
    }
    const live = mapLiveFlow(flow, config.timeZone);
    if (live) {
      const ok = await pv.addStatus(live);
      if (ok) {
        log.info("Live upload", {
          date: live.date,
          time: live.time,
          v2: live.v2,
          v4: live.v4,
          v5: live.v5,
          v6: live.v6,
        });
      } else {
        log.warn("Live upload deferred (already sent or rate limited)", {
          date: live.date,
          time: live.time,
          v5: live.v5,
          v6: live.v6,
        });
      }
    } else {
      log.warn("Live flow had no mappable power/energy fields");
    }
  } catch (error) {
    log.error("Live poll failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await uploadDay(sems, pv, config, 0);
  } catch (error) {
    if (error instanceof PvOutputRateLimitError) {
      log.warn("Today upload deferred due to PVOutput rate limit", { waitMs: error.waitMs });
    } else {
      log.error("Today historical upload failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  log.debug("Poll tick done");
}

async function backfillPastDays(
  sems: SemsClient,
  pv: PvOutputClient,
  config: AppConfig,
  state: UploadState,
): Promise<void> {
  const offsets = backfillPastDayOffsets(config.backfillDays);
  log.info("Starting past-day backfill", {
    days: config.backfillDays,
    offsets,
    alreadyCompleted: state.completedDates.length,
  });

  const pendingOffsets = offsets.filter((offset) => {
    const { localDate } = localDayWindow(config.timeZone, offset);
    return !isDateCompleted(state, localDate);
  });
  const skippedDates = offsets
    .map((offset) => localDayWindow(config.timeZone, offset).localDate)
    .filter((localDate) => isDateCompleted(state, localDate));

  if (skippedDates.length > 0) {
    log.info("Already uploaded historical days from before today — skipping SEMS and PVOutput", {
      dates: skippedDates,
    });
  }
  if (pendingOffsets.length === 0) {
    log.info("No pending historical days to upload");
    return;
  }

  for (const offset of pendingOffsets) {
    try {
      const result = await uploadPastDay(sems, pv, config, offset);
      if (result.complete) {
        markDateCompleted(state, result.localDate);
      } else {
        log.warn(
          "Historical day incomplete (likely rate limited) — will retry PVOutput next start without SEMS",
          {
            localDate: result.localDate,
            uploaded: result.uploaded,
            statuses: result.statuses,
          },
        );
        return;
      }
    } catch (error) {
      if (error instanceof PvOutputRateLimitError) {
        log.warn("Backfill paused due to PVOutput rate limit — remaining days deferred", {
          offset,
          waitMs: error.waitMs,
        });
        return;
      }
      log.error("Backfill day failed", {
        offset,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  configureLogger({ level: config.logLevel });
  log.info("Starting goodwesemsplus", {
    server: config.region.label,
    stationId: config.station.stationId,
    stationName: config.station.stationName,
    deviceSn: config.device?.deviceSn,
    deviceType: config.device?.deviceType,
    timeZone: config.timeZone,
    pollIntervalMs: config.pollIntervalMs,
    backfillDays: config.backfillDays,
    logLevel: config.logLevel,
  });

  const state = loadUploadState(config.station.stationId);
  log.info("Upload state loaded", {
    path: getUploadStatePath(),
    completedDates: state.completedDates,
  });
  const sems = new SemsClient(config.region, config.email, config.password);
  const pv = new PvOutputClient(config.pvoutputApi, config.pvoutputSystemId);

  await sems.ensureLogin();
  await backfillPastDays(sems, pv, config, state);
  await pollOnce(sems, pv, config);

  setInterval(() => {
    void pollOnce(sems, pv, config).catch((error) => {
      log.error("Poll failed", { error: error instanceof Error ? error.message : String(error) });
    });
  }, config.pollIntervalMs);

  log.info("Scheduler running");
}

main().catch((error) => {
  log.error("Fatal", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
