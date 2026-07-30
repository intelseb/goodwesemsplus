import type { SemsClient } from "../sems/client.js";
import { log } from "../util/logger.js";

const DEFAULT_DEVICE_TYPE = "ENERGY_STORAGE_INTEGRATED_CABINET";

export type EquipmentTelemetry = {
  tempC?: number;
  voltageV?: number;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

type TelemetryFactor = {
  code?: unknown;
  data?: unknown;
  alias?: unknown;
};

type TelemetryGroup = {
  code?: unknown;
  alias?: unknown;
  factors?: unknown;
};

/** SEMS+ equipment telemetry: groups like system_parameters → Temperature. */
export function parseEquipmentTelemetry(json: unknown): EquipmentTelemetry {
  const data = (json as { data?: unknown }).data ?? json;
  if (!Array.isArray(data)) return {};

  let tempC: number | undefined;
  let voltageV: number | undefined;

  for (const group of data as TelemetryGroup[]) {
    if (!group || typeof group !== "object") continue;
    const factors = Array.isArray(group.factors) ? (group.factors as TelemetryFactor[]) : [];
    const groupCode = String(group.code ?? "");
    const groupAlias = String(group.alias ?? "");

    for (const factor of factors) {
      if (!factor || typeof factor !== "object") continue;
      const code = String(factor.code ?? "");
      const alias = String(factor.alias ?? "");
      const value = asNumber(factor.data);
      if (value === undefined) continue;

      if (tempC === undefined && (/^temperature$/i.test(code) || /temperature/i.test(alias))) {
        tempC = value;
      }

      if (
        voltageV === undefined &&
        (groupCode === "ac" || groupAlias === "ac_parameters") &&
        (/^vac$/i.test(code) || /volt/i.test(alias))
      ) {
        voltageV = value;
      }
    }
  }

  return { tempC, voltageV };
}

export async function fetchEquipmentTelemetry(
  client: SemsClient,
  options: { deviceSn: string; deviceType?: string; stationId: string },
): Promise<EquipmentTelemetry> {
  const deviceType = options.deviceType || DEFAULT_DEVICE_TYPE;
  const json = await client.request(
    "GET",
    `/sems-plant/api/equipments/${encodeURIComponent(options.deviceSn)}/telemetry`,
    {
      query: {
        deviceType,
        pwId: options.stationId,
      },
    },
  );
  const parsed = parseEquipmentTelemetry(json);
  log.debug("Equipment telemetry parsed", {
    deviceSn: options.deviceSn,
    deviceType,
    tempC: parsed.tempC,
    voltageV: parsed.voltageV,
  });
  return parsed;
}
