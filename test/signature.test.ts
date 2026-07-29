import { describe, expect, it } from "vitest";
import { buildXSignature, hashPasswordForSemsPlus } from "../src/sems/signature.js";

describe("hashPasswordForSemsPlus", () => {
  it("returns base64 of md5 hex", () => {
    // md5("test") = 098f6bcd4621d373cade4e832627b4f6
    expect(hashPasswordForSemsPlus("test")).toBe(
      Buffer.from("098f6bcd4621d373cade4e832627b4f6", "utf8").toString("base64"),
    );
  });
});

describe("buildXSignature", () => {
  it("matches known formula for fixed timestamp", () => {
    const ts = 1785372032692;
    const uid = "bb2c9870-6890-40b2-8c5f-7e7a0a811b16";
    const token = "5aabad45ffd8c8428934fbe6aeae5766";
    const sig = buildXSignature(uid, token, ts);
    const decoded = Buffer.from(sig, "base64").toString("utf8");
    expect(decoded.endsWith(`@${ts}`)).toBe(true);
    expect(decoded.split("@")[0]).toHaveLength(64);
    expect(sig).toBe(buildXSignature(uid, token, ts));
  });

  it("uses empty uid/token for login", () => {
    const ts = 1;
    const decoded = Buffer.from(buildXSignature("", "", ts), "base64").toString("utf8");
    expect(decoded.endsWith("@1")).toBe(true);
  });
});
