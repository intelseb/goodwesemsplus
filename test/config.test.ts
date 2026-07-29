import { describe, expect, it } from "vitest";
import { decodeStationDetail, loadConfig } from "../src/config.js";

const stationDetail = Buffer.from(
  JSON.stringify({
    stationId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    stationName: "Example Solar Home",
    stationType: 2,
    fromLogin: true,
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

describe("loadConfig", () => {
  it("loads from env without dotenv file", () => {
    const cfg = loadConfig(
      {
        SERVER: "Australia",
        EMAIL: "a@b.c",
        PASSWORD: "secret",
        STATION_DETAIL: stationDetail,
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
  });
});
