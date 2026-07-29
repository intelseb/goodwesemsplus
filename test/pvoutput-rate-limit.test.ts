import { describe, expect, it } from "vitest";
import { isRateLimitResponse } from "../src/pvoutput/client.js";

describe("isRateLimitResponse", () => {
  it("detects PVOutput 403 quota body", () => {
    expect(isRateLimitResponse(403, "Forbidden 403: Exceeded 60 requests per hour")).toBe(true);
    expect(isRateLimitResponse(500, "server error")).toBe(false);
    expect(isRateLimitResponse(403, "Forbidden")).toBe(false);
  });
});
