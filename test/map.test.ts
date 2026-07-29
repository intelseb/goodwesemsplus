import { describe, expect, it } from "vitest";
import { collectSeries } from "../src/poll/historical.js";
import { parseFlowPayload } from "../src/poll/live.js";
import { mapHistoricalPoints, mapLiveFlow } from "../src/poll/map.js";

describe("collectSeries", () => {
  it("merges parallel item arrays by time", () => {
    const points = collectSeries({
      pSystem: [
        { time: "2026-07-29 10:00:00", value: 1.5 },
        { time: "2026-07-29 10:15:00", value: 2 },
      ],
      pConsum: [
        { time: "2026-07-29 10:00:00", value: 0.8 },
        { time: "2026-07-29 10:15:00", value: 1.1 },
      ],
    });
    expect(points).toHaveLength(2);
    expect(points[0]?.values.pSystem).toBe(1.5);
    expect(points[0]?.values.pConsum).toBe(0.8);
  });

  it("parses SEMS+ dataList powerData shape and downsamples to 15 min", () => {
    const points = collectSeries({
      dataList: [
        {
          item: "pSystem",
          powerData: [
            { tp: "2026-07-30 00:00:00", power: 0 },
            { tp: "2026-07-30 00:01:00", power: 0.1 },
            { tp: "2026-07-30 00:05:00", power: 1.2 },
            { tp: "2026-07-30 00:15:00", power: 1.4 },
            { tp: "2026-07-30 00:16:00", power: 1.5 },
            { tp: "2026-07-30 10:00:00", power: 2.5 },
          ],
        },
        {
          item: "pConsum",
          powerData: [
            { tp: "2026-07-30 00:00:00", power: 0.4 },
            { tp: "2026-07-30 00:15:00", power: 0.5 },
            { tp: "2026-07-30 10:00:00", power: 0.8 },
          ],
        },
      ],
    });
    expect(points.map((point) => point.time)).toEqual([
      "2026-07-30 00:00:00",
      "2026-07-30 00:15:00",
      "2026-07-30 10:00:00",
    ]);
    expect(points[2]?.values.pSystem).toBe(2.5);
    expect(points[2]?.values.pConsum).toBe(0.8);
  });
});

describe("mapHistoricalPoints", () => {
  it("maps kW power to W for PVOutput and omits temp/voltage", () => {
    const statuses = mapHistoricalPoints(
      [
        {
          time: "2026-07-29 10:00:00",
          values: { pSystem: 2.5, pConsum: 1.2, temp: 30, voltage: 240 },
        },
      ],
      "Australia/Perth",
    );
    expect(statuses[0]).toMatchObject({
      date: "20260729",
      time: "10:00",
      v2: 2500,
      v4: 1200,
    });
    expect(statuses[0]?.v5).toBeUndefined();
    expect(statuses[0]?.v6).toBeUndefined();
  });
});

describe("mapLiveFlow", () => {
  it("maps flow payload", () => {
    const flow = parseFlowPayload({
      data: { pSystem: 1.1, pConsum: 0.4, temperature: 32.5, vac: 240 },
    });
    const status = mapLiveFlow(flow, "Australia/Perth", new Date("2026-07-29T02:00:00Z"));
    expect(status?.v2).toBe(1100);
    expect(status?.v4).toBe(400);
    expect(status?.v5).toBe(32.5);
    expect(status?.v6).toBe(240);
  });
});
