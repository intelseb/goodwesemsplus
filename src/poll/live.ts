import type { SemsClient } from "../sems/client.js";
import { log } from "../util/logger.js";

export type LiveFlow = {
  pSystem?: number;
  pConsum?: number;
  pGrid?: number;
  pBat?: number;
  soc?: number;
  temp?: number;
  voltage?: number;
  eGen?: number;
  eUse?: number;
  raw: Record<string, unknown>;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function flatten(obj: unknown, out: Record<string, unknown>, prefix = ""): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) return;
  for (const [fieldName, fieldValue] of Object.entries(obj as Record<string, unknown>)) {
    const dottedKey = prefix ? `${prefix}.${fieldName}` : fieldName;
    if (fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
      flatten(fieldValue, out, dottedKey);
    } else {
      out[dottedKey] = fieldValue;
      out[fieldName] = fieldValue;
    }
  }
}

export function parseFlowPayload(json: unknown): LiveFlow {
  const data = (json as { data?: unknown }).data ?? json;
  const flat: Record<string, unknown> = {};
  flatten(data, flat);

  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const parsed = asNumber(flat[key]);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  };

  return {
    pSystem: pick("pSystem", "ppv", "pPv", "pv", "generation", "pGeneration", "solarPower"),
    pConsum: pick("pConsum", "pload", "pLoad", "load", "consumption", "pConsumption"),
    pGrid: pick("pGrid", "grid", "pMeter"),
    pBat: pick("pBat", "battery", "pBattery"),
    soc: pick("soc", "batterySoc", "batSoc"),
    temp: pick("temp", "temperature", "inverterTemp", "tInner", "airTemperature"),
    voltage: pick("voltage", "vac", "vAc", "vgrid", "vGrid", "ua", "uA"),
    eGen: pick("eGen", "eday", "eDay", "generationEnergy", "ePvToday", "proPvStatsToday"),
    eUse: pick("eUse", "eLoadToday", "consumptionEnergy", "eConsumToday"),
    raw: flat,
  };
}

export async function fetchLiveFlow(client: SemsClient, stationId: string): Promise<LiveFlow> {
  const json = await client.request("GET", "/sems-plant/api/stations/flow", {
    query: { stationId },
  });
  const flow = parseFlowPayload(json);
  log.debug("Live flow parsed", {
    pSystem: flow.pSystem,
    pConsum: flow.pConsum,
    pGrid: flow.pGrid,
    temp: flow.temp,
    voltage: flow.voltage,
    eGen: flow.eGen,
    eUse: flow.eUse,
    rawKeyCount: Object.keys(flow.raw).length,
    rawKeys: Object.keys(flow.raw).slice(0, 40),
  });
  return flow;
}
