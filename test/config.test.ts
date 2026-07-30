import { describe, expect, it } from "vitest";
import { decodeDeviceDetail, decodeStationDetail, loadConfig } from "../src/config.js";

const stationDetail = Buffer.from(
  JSON.stringify({
    stationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    stationName: "Example Solar Home",
    stationType: 2,
    fromLogin: true,
  }),
  "utf8",
).toString("base64");

const deviceDetail = Buffer.from(
  JSON.stringify({
    stationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    stationName: "Example Solar Home",
    deviceSn: "EXAMPLESN123456",
    deviceType: "ENERGY_STORAGE_INTEGRATED_CABINET",
    timespan: -8,
    subtype: "RESIDENTIAL",
  }),
  "utf8",
).toString("base64");

describe("decodeStationDetail", () => {
  it("decodes station id", () => {
    expect(decodeStationDetail(stationDetail).stationId).toBe(
      "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    );
  });
});

describe("decodeDeviceDetail", () => {
  it("decodes device sn and type", () => {
    const device = decodeDeviceDetail(deviceDetail);
    expect(device.deviceSn).toBe("EXAMPLESN123456");
    expect(device.deviceType).toBe("ENERGY_STORAGE_INTEGRATED_CABINET");
    expect(device.stationId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });
});

describe("loadConfig", () => {
  it("loads from env without dotenv file", () => {
    const cfg = loadConfig(
      {
        SERVER: "Australia",
        EMAIL: "a@b.c",
        PASSWORD: "secret",
        STATION_DETAIL: stationDetail,
        DEVICE_DETAIL: deviceDetail,
        PVOUTPUT_API: "key",
        PVOUTPUT_SYSTEM_ID: "12345",
        BACKFILL_DAYS: "3",
      },
      false,
    );
    expect(cfg.region.code).toBe("au");
    expect(cfg.backfillDays).toBe(3);
    expect(cfg.timeZone).toBe("Australia/Perth");
    expect(cfg.pollIntervalMs).toBe(900_000);
    expect(cfg.logLevel).toBe("info");
    expect(cfg.device?.deviceSn).toBe("EXAMPLESN123456");
  });
});
