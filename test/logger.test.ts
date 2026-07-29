import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { configureLogger, log } from "../src/util/logger.js";

describe("logger colors", () => {
  const originalLog = console.log;
  const lines: string[] = [];

  beforeEach(() => {
    lines.length = 0;
    console.log = (...args: unknown[]) => {
      lines.push(String(args[0] ?? ""));
    };
    configureLogger({ level: "debug", color: true });
  });

  afterEach(() => {
    console.log = originalLog;
    configureLogger({ level: "info", color: false });
  });

  it("uses cyan for debug and green for info", () => {
    log.debug("dbg-msg");
    log.info("info-msg");
    expect(lines[0]).toContain("\x1b[36m");
    expect(lines[0]).toContain("dbg-msg");
    expect(lines[1]).toContain("\x1b[32m");
    expect(lines[1]).toContain("info-msg");
  });
});
