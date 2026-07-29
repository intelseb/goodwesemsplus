export type ServerCode = "cn" | "au" | "hk" | "eu" | "us";

export type RegionConfig = {
  code: ServerCode;
  label: string;
  webOrigin: string;
  defaultGatewayApi: string;
  defaultTimezone: string;
};

const REGIONS: Record<ServerCode, RegionConfig> = {
  cn: {
    code: "cn",
    label: "China",
    webOrigin: "https://cn-semsplus.goodwe.com",
    defaultGatewayApi: "https://cn-gateway.semsportal.com/web/sems",
    defaultTimezone: "Asia/Shanghai",
  },
  au: {
    code: "au",
    label: "Australia",
    webOrigin: "https://au-semsplus.goodwe.com",
    defaultGatewayApi: "https://au-gateway.semsportal.com/web/sems",
    defaultTimezone: "Australia/Perth",
  },
  hk: {
    code: "hk",
    label: "International",
    webOrigin: "https://hk-semsplus.goodwe.com",
    defaultGatewayApi: "https://hk-gateway.semsportal.com/web/sems",
    defaultTimezone: "Asia/Hong_Kong",
  },
  eu: {
    code: "eu",
    label: "Europe",
    webOrigin: "https://eu-semsplus.goodwe.com",
    defaultGatewayApi: "https://eu-gateway.semsportal.com/web/sems",
    defaultTimezone: "Europe/Berlin",
  },
  us: {
    code: "us",
    label: "Americas",
    webOrigin: "https://us-semsplus.goodwe.com",
    defaultGatewayApi: "https://us-gateway.semsportal.com/web/sems",
    defaultTimezone: "America/New_York",
  },
};

const LABEL_TO_CODE: Record<string, ServerCode> = {
  china: "cn",
  cn: "cn",
  australia: "au",
  au: "au",
  international: "hk",
  hk: "hk",
  europe: "eu",
  eu: "eu",
  americas: "us",
  america: "us",
  us: "us",
};

export function resolveRegion(server: string): RegionConfig {
  const code = LABEL_TO_CODE[server.trim().toLowerCase()];
  if (!code) {
    const valid = Object.values(REGIONS)
      .map((region) => `${region.label} (${region.code})`)
      .join(", ");
    throw new Error(`Unknown SERVER "${server}". Valid: ${valid}`);
  }
  return REGIONS[code];
}

export function listRegions(): RegionConfig[] {
  return Object.values(REGIONS);
}

export function isTrustedApiBase(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host.endsWith(".semsportal.com") || host.endsWith(".goodwe.com");
  } catch {
    return false;
  }
}
