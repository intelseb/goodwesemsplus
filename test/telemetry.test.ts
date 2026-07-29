import { describe, expect, it } from "vitest";
import { parseEquipmentTelemetry } from "../src/poll/telemetry.js";

describe("parseEquipmentTelemetry", () => {
  it("reads Temperature from system_parameters and Vac from ac", () => {
    const parsed = parseEquipmentTelemetry({
      data: [
        {
          code: "system",
          alias: "system_parameters",
          factors: [
            { code: "sn", data: "EXAMPLESN123456", dataType: "STRING" },
            {
              code: "Temperature",
              data: "23.6",
              dataType: "NUMERIC",
              unit: "℃",
              alias: "chamber_temperature",
            },
          ],
        },
        {
          code: "ac",
          alias: "ac_parameters",
          factors: [
            {
              code: "Vac",
              data: "241.8",
              dataType: "NUMERIC",
              unit: "V",
              alias: "single_phase_volt",
            },
          ],
        },
      ],
    });
    expect(parsed.tempC).toBe(23.6);
    expect(parsed.voltageV).toBe(241.8);
  });
});
