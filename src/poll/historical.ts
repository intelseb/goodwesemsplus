import type { SemsClient } from "../sems/client.js";
import { goodweTimeZoneParam } from "../util/time.js";
import { log, summarizeForLog } from "../util/logger.js";

const DEFAULT_ITEMS = ["pSystem", "soc", "pBat", "pConsum", "pGrid"];

export type HistoricalPoint = {
  time: string;
  values: Record<string, number | undefined>;
};

type StatsResponse = {
  data?: unknown;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sortPoints(points: HistoricalPoint[]): HistoricalPoint[] {
  return points.sort((left, right) => left.time.localeCompare(right.time));
}

/** SEMS+ HEMS shape: { dataList: [{ item, powerData: [{ tp, power }] }] } */
function collectDataListSeries(root: Record<string, unknown>): HistoricalPoint[] | null {
  const dataList = root.dataList;
  if (!Array.isArray(dataList) || dataList.length === 0) return null;
  if (!dataList[0] || typeof dataList[0] !== "object") return null;
  if (!("item" in (dataList[0] as object) && "powerData" in (dataList[0] as object))) {
    return null;
  }

  const valuesByTime = new Map<string, Record<string, number | undefined>>();
  for (const entry of dataList) {
    if (!entry || typeof entry !== "object") continue;
    const series = entry as Record<string, unknown>;
    const itemName = String(series.item ?? "");
    if (!itemName) continue;
    const powerData = series.powerData;
    if (!Array.isArray(powerData)) continue;
    log.debug("Historical dataList series", { itemName, sampleCount: powerData.length });

    for (const sample of powerData) {
      if (!sample || typeof sample !== "object") continue;
      const sampleRecord = sample as Record<string, unknown>;
      const time = String(sampleRecord.tp ?? sampleRecord.time ?? sampleRecord.dateTime ?? "");
      if (!time) continue;
      const bucket = valuesByTime.get(time) ?? {};
      bucket[itemName] = asNumber(sampleRecord.power ?? sampleRecord.value ?? sampleRecord.y);
      valuesByTime.set(time, bucket);
    }
  }

  const points = sortPoints(
    [...valuesByTime.entries()].map(([time, values]) => ({ time, values })),
  );
  log.debug("Historical merged dataList by time", {
    count: points.length,
    sample: points[0],
    mid: points[Math.floor(points.length / 2)],
  });
  return points;
}

/**
 * Keep wall-clock samples on N-minute boundaries (PVOutput expects ~5–15 min).
 * SEMS+ often returns 1-minute series.
 */
export function downsampleToIntervalMinutes(
  points: HistoricalPoint[],
  intervalMinutes: number,
): HistoricalPoint[] {
  if (intervalMinutes <= 1) return points;
  return points.filter((point) => {
    const match = point.time.match(/ (\d{2}):(\d{2})/);
    if (!match) return true;
    const minute = Number(match[2]);
    return minute % intervalMinutes === 0;
  });
}

function collectSeries(data: unknown): HistoricalPoint[] {
  if (!data || typeof data !== "object") {
    log.debug("Historical payload is not an object", { type: typeof data });
    return [];
  }

  const root = data as Record<string, unknown>;
  log.debug("Historical payload keys", { keys: Object.keys(root).slice(0, 40) });

  const dataListPoints = collectDataListSeries(root);
  if (dataListPoints) {
    const downsampled = downsampleToIntervalMinutes(dataListPoints, 15);
    log.debug("Historical downsampled to 15 min", {
      before: dataListPoints.length,
      after: downsampled.length,
    });
    return downsampled;
  }

  const candidates = [root.list, root.datas, root.data, root.power, root.points, root.items];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0 && typeof candidate[0] === "object") {
      const first = candidate[0] as Record<string, unknown>;
      if ("item" in first && "powerData" in first) {
        const nested = collectDataListSeries({ dataList: candidate });
        if (nested) return downsampleToIntervalMinutes(nested, 15);
      }
      const points = candidate
        .map((row) => normalizeRow(row as Record<string, unknown>))
        .filter(Boolean) as HistoricalPoint[];
      log.debug("Historical parsed row-array series", {
        count: points.length,
        sample: points[0],
      });
      return points;
    }
  }

  // Shape: { pSystem: [{time,value}], pConsum: [...] }
  const seriesKeys = Object.keys(root).filter((key) => Array.isArray(root[key]));
  if (seriesKeys.length > 0) {
    const valuesByTime = new Map<string, Record<string, number | undefined>>();
    for (const seriesKey of seriesKeys) {
      const samples = root[seriesKey] as unknown[];
      log.debug("Historical series array", { seriesKey, sampleCount: samples.length });
      for (const sample of samples) {
        if (!sample || typeof sample !== "object") continue;
        const sampleRecord = sample as Record<string, unknown>;
        const time = String(
          sampleRecord.tp ??
            sampleRecord.time ??
            sampleRecord.dateTime ??
            sampleRecord.tm ??
            sampleRecord.x ??
            "",
        );
        if (!time) continue;
        const bucket = valuesByTime.get(time) ?? {};
        bucket[seriesKey] = asNumber(
          sampleRecord.power ??
            sampleRecord.value ??
            sampleRecord.y ??
            sampleRecord.val ??
            sampleRecord.data,
        );
        valuesByTime.set(time, bucket);
      }
    }
    const points = sortPoints(
      [...valuesByTime.entries()].map(([time, values]) => ({ time, values })),
    );
    log.debug("Historical merged series by time", {
      count: points.length,
      sample: points[0],
      mid: points[Math.floor(points.length / 2)],
    });
    return downsampleToIntervalMinutes(points, 15);
  }

  log.debug("Historical payload had no recognizable series shape", {
    preview: summarizeForLog(root, 500),
  });
  return [];
}

function normalizeRow(row: Record<string, unknown>): HistoricalPoint | null {
  const time = String(row.tp ?? row.time ?? row.dateTime ?? row.tm ?? row.createTime ?? "");
  if (!time) return null;
  const values: Record<string, number | undefined> = {};
  for (const [fieldName, fieldValue] of Object.entries(row)) {
    if (
      fieldName === "tp" ||
      fieldName === "time" ||
      fieldName === "dateTime" ||
      fieldName === "tm" ||
      fieldName === "createTime"
    ) {
      continue;
    }
    const parsed = asNumber(fieldValue);
    if (parsed !== undefined) values[fieldName] = parsed;
  }
  return { time, values };
}

export async function fetchDayStatistics(
  client: SemsClient,
  stationId: string,
  startTime: string,
  endTime: string,
  timeZone: string,
  items: string[] = DEFAULT_ITEMS,
): Promise<HistoricalPoint[]> {
  const json = await client.request<StatsResponse>(
    "POST",
    "/sems-plant/api/v1/hems/power/statisticsAndPreV2",
    {
      body: {
        stationId,
        items,
        timeScale: 1,
        timeZone: goodweTimeZoneParam(timeZone),
        startTime,
        endTime,
      },
    },
  );

  const data = (json as { data?: unknown }).data ?? json;
  log.debug("Historical fetch window", {
    stationId,
    startTime,
    endTime,
    timeZoneParam: goodweTimeZoneParam(timeZone),
  });
  return collectSeries(data);
}

export { collectSeries, DEFAULT_ITEMS };
