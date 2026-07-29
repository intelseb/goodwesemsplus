import { describe, expect, it } from "vitest";
import { isTrustedApiBase, listRegions, resolveRegion } from "../src/sems/regions.js";

describe("resolveRegion", () => {
  it("accepts labels and codes", () => {
    expect(resolveRegion("Australia").code).toBe("au");
    expect(resolveRegion("au").webOrigin).toBe("https://au-semsplus.goodwe.com");
    expect(resolveRegion("International").code).toBe("hk");
    expect(resolveRegion("Europe").defaultGatewayApi).toContain("eu-gateway");
    expect(resolveRegion("Americas").code).toBe("us");
    expect(resolveRegion("China").code).toBe("cn");
  });

  it("rejects unknown servers", () => {
    expect(() => resolveRegion("mars")).toThrow(/Unknown SERVER/);
  });

  it("lists five portal regions", () => {
    expect(listRegions()).toHaveLength(5);
  });
});

describe("isTrustedApiBase", () => {
  it("allows goodwe/semsportal https hosts", () => {
    expect(isTrustedApiBase("https://au-gateway.semsportal.com/web/sems")).toBe(true);
    expect(isTrustedApiBase("https://eu-semsplus.goodwe.com")).toBe(true);
    expect(isTrustedApiBase("http://au-gateway.semsportal.com/web/sems")).toBe(false);
    expect(isTrustedApiBase("https://evil.example.com")).toBe(false);
  });
});
