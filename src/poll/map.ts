import type { HistoricalPoint } from "./historical.js";
import type { LiveFlow } from "./live.js";
import type { PvStatus } from "../sems/types.js";
import { formatInTimeZone, pvoutputDateTimeFromLocal } from "../util/time.js";
import { log } from "../util/logger.js";

const loggedKeys = new Set<string>();

function firstNumber(
  values: Record<string, number | undefined>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined && Number.isFinite(value)) return value;
  }
  return undefined;
}

function maybeKwToW(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  // SEMS HEMS charts are typically kW; PVOutput wants W.
  if (Math.abs(value) <= 100) return Math.round(value * 1000);
  return Math.round(value);
}

function maybeKwhToWh(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (Math.abs(value) < 500) return Math.round(value * 1000);
  return Math.round(value);
}

function logUnknownOnce(source: string, keys: string[]): void {
  const interesting = keys.filter((key) =>
    /temp|volt|power|energy|pSystem|pConsum|eday|load|pv|gen|consum/i.test(key),
  );
  const signature = `${source}:${interesting.sort().join(",")}`;
  if (interesting.length === 0 || loggedKeys.has(signature)) return;
  loggedKeys.add(signature);
  log.debug("SEMS field keys observed", { source, keys: interesting.slice(0, 40) });
}

export function mapHistoricalPoints(points: HistoricalPoint[], timeZone: string): PvStatus[] {
  const statuses: PvStatus[] = [];
  let skippedNoPower = 0;
  let skippedBadTime = 0;

  for (const point of points) {
    logUnknownOnce("historical", Object.keys(point.values));
    const dateTime = pvoutputDateTimeFromLocal(point.time, timeZone);
    if (!dateTime) {
      skippedBadTime += 1;
      continue;
    }

    const energyGenerationWh = maybeKwhToWh(
      firstNumber(point.values, ["eGen", "eday", "eDay", "generationEnergy", "ePv"]),
    );
    const powerGenerationW = maybeKwToW(
      firstNumber(point.values, ["pSystem", "ppv", "pPv", "generation", "pv"]),
    );
    const energyConsumptionWh = maybeKwhToWh(
      firstNumber(point.values, ["eUse", "eLoad", "consumptionEnergy", "eConsum"]),
    );
    const powerConsumptionW = maybeKwToW(
      firstNumber(point.values, ["pConsum", "pload", "pLoad", "load", "consumption"]),
    );
    if (
      energyGenerationWh === undefined &&
      powerGenerationW === undefined &&
      energyConsumptionWh === undefined &&
      powerConsumptionW === undefined
    ) {
      skippedNoPower += 1;
      continue;
    }
    // Historical charts have no temp/voltage — omit v5/v6 so PVOutput does not store -1.
    statuses.push({
      date: dateTime.date,
      time: dateTime.time,
      v1: energyGenerationWh,
      v2: powerGenerationW,
      v3: energyConsumptionWh,
      v4: powerConsumptionW,
    });
  }

  log.debug("Historical map result", {
    inputPoints: points.length,
    mappedStatuses: statuses.length,
    skippedBadTime,
    skippedNoPower,
    sample: statuses[0],
    last: statuses.at(-1),
  });
  return statuses;
}

export function mapLiveFlow(
  flow: LiveFlow,
  timeZone: string,
  now: Date = new Date(),
): PvStatus | null {
  logUnknownOnce("live", Object.keys(flow.raw));
  const date = formatInTimeZone(now, timeZone, "yyyyMMdd");
  const time = formatInTimeZone(now, timeZone, "HH:mm");

  const energyGenerationWh = maybeKwhToWh(flow.eGen);
  const powerGenerationW = maybeKwToW(flow.pSystem);
  const energyConsumptionWh = maybeKwhToWh(flow.eUse);
  const powerConsumptionW = maybeKwToW(flow.pConsum);
  const temperatureC = flow.temp;
  const voltageV = flow.voltage;

  if (
    energyGenerationWh === undefined &&
    powerGenerationW === undefined &&
    energyConsumptionWh === undefined &&
    powerConsumptionW === undefined
  ) {
    log.debug("Live map skipped — no power/energy fields", {
      pSystem: flow.pSystem,
      pConsum: flow.pConsum,
      eGen: flow.eGen,
      eUse: flow.eUse,
    });
    return null;
  }
  const status = {
    date,
    time,
    v1: energyGenerationWh,
    v2: powerGenerationW,
    v3: energyConsumptionWh,
    v4: powerConsumptionW,
    v5: temperatureC,
    v6: voltageV,
  };
  log.debug("Live map result", status);
  return status;
}
