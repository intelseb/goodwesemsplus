import { describe, expect, it } from "vitest";
import { extractSession } from "../src/sems/auth.js";
import { isSuccessCode } from "../src/sems/codes.js";
import { resolveRegion } from "../src/sems/regions.js";
import { sessionTokenHeader } from "../src/sems/types.js";

describe("isSuccessCode", () => {
  it("accepts zero-padded success codes", () => {
    expect(isSuccessCode("00000")).toBe(true);
    expect(isSuccessCode(0)).toBe(true);
    expect(isSuccessCode("C0602")).toBe(false);
  });
});

describe("extractSession", () => {
  it("prefers trusted api from login payload", () => {
    const session = extractSession(
      {
        code: "00000",
        data: {
          uid: "u1",
          token: "t1",
          timestamp: "123",
          api: "https://au-gateway.semsportal.com/web/sems",
          region: "au",
          uuid: "device-1",
          client: "semsPlusWeb",
        },
      },
      resolveRegion("Australia"),
      "fallback-device",
    );
    expect(session.api).toBe("https://au-gateway.semsportal.com/web/sems");
    expect(session.uid).toBe("u1");
    expect(session.uuid).toBe("device-1");
    expect(JSON.parse(sessionTokenHeader(session)).uuid).toBe("device-1");
  });

  it("falls back when api is untrusted", () => {
    const session = extractSession(
      {
        code: 0,
        data: {
          uid: "u1",
          token: "t1",
          api: "https://evil.example.com",
        },
      },
      resolveRegion("Europe"),
      "dev",
    );
    expect(session.api).toBe("https://eu-gateway.semsportal.com/web/sems");
  });
});
