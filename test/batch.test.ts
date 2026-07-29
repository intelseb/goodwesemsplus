import { describe, expect, it } from "vitest";
import {
  chunkStatuses,
  formatBatchStatusLine,
  formatBatchStatusPayload,
  PVOUTPUT_BATCH_LIMIT,
} from "../src/pvoutput/batch.js";

describe("chunkStatuses", () => {
  it("chunks to batch limit", () => {
    const items = Array.from({ length: 65 }, (_, i) => i);
    const chunks = chunkStatuses(items);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(PVOUTPUT_BATCH_LIMIT);
    expect(chunks[2]).toHaveLength(5);
  });
});

describe("formatBatchStatusPayload", () => {
  it("uses -1 for missing mid fields and omits trailing temp/voltage", () => {
    const line = formatBatchStatusLine({
      date: "20260729",
      time: "10:00",
      v2: 1500,
      v4: 200,
    });
    expect(line).toBe("20260729,10:00,-1,1500,-1,200");
    expect(
      formatBatchStatusLine({
        date: "20260729",
        time: "10:00",
        v2: 1500,
        v4: 200,
        v5: 23.6,
      }),
    ).toBe("20260729,10:00,-1,1500,-1,200,23.6");
    expect(
      formatBatchStatusPayload([
        { date: "20260729", time: "10:00", v2: 1 },
        { date: "20260729", time: "10:15", v2: 2 },
      ]),
    ).toContain(";");
  });
});
