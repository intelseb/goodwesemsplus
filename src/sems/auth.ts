import { isSuccessCode } from "./codes.js";
import type { RegionConfig } from "./regions.js";
import { isTrustedApiBase } from "./regions.js";
import { buildXSignature, hashPasswordForSemsPlus } from "./signature.js";
import type { SemsSession } from "./types.js";
import { buildTraceparent, getDeviceId } from "../util/device.js";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

export const BROWSER_BRAND = "Chrome 150.0.0.0 Google Inc. en-AU Australia/Perth";
export const BROWSER_OS = "macOS 10.15.7 desktop";

type LoginData = {
  uid?: unknown;
  token?: unknown;
  timestamp?: unknown;
  api?: unknown;
  region?: unknown;
  uuid?: unknown;
  client?: unknown;
  version?: unknown;
  language?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function extractSession(
  json: unknown,
  region: RegionConfig,
  deviceId: string = getDeviceId(),
): SemsSession {
  const root = json as { code?: unknown; msg?: unknown; data?: LoginData };
  if (!isSuccessCode(root?.code)) {
    throw new Error(
      `SEMS+ login rejected: ${String(root?.msg ?? "unknown")} (code=${String(root?.code)})`,
    );
  }

  const data = root.data ?? (json as LoginData);
  const uid = asString(data.uid);
  const token = asString(data.token);
  if (!uid || !token) {
    throw new Error("SEMS+ login response missing uid/token");
  }

  const apiCandidate = asString(data.api);
  const api =
    apiCandidate && isTrustedApiBase(apiCandidate)
      ? apiCandidate.replace(/\/$/, "")
      : region.defaultGatewayApi;

  return {
    uid,
    token,
    timestamp: asString(data.timestamp) ?? String(Date.now()),
    api,
    region: asString(data.region) ?? region.code,
    uuid: asString(data.uuid) ?? deviceId,
    client: asString(data.client) ?? "semsPlusWeb",
    version: asString(data.version) ?? "",
    language: asString(data.language) ?? "en",
  };
}

export function semsBrowserHeaders(
  webOrigin: string,
  tokenJson: string,
  uidForSig: string,
  tokenForSig: string,
  uuid: string,
): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    "Access-Control-Allow-Origin": "*",
    Origin: webOrigin,
    Referer: `${webOrigin}/`,
    "User-Agent": USER_AGENT,
    currentLang: "en",
    token: tokenJson,
    uuid,
    "X-Signature": buildXSignature(uidForSig, tokenForSig),
    brand: BROWSER_BRAND,
    os: BROWSER_OS,
    neutral: "0",
    traceparent: buildTraceparent(),
    "sec-ch-ua": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
  };
}

export async function loginSemsPlus(
  region: RegionConfig,
  email: string,
  password: string,
): Promise<SemsSession> {
  const deviceId = getDeviceId();
  const url = `${region.webOrigin}/web/sems/sems-user/api/v1/auth/cross-login`;
  const emptyToken = JSON.stringify({
    uid: "",
    timestamp: 0,
    token: "",
    client: "semsPlusWeb",
    version: "",
    language: "en",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...semsBrowserHeaders(region.webOrigin, emptyToken, "", "", deviceId),
      "Content-Type": "application/json",
    },
    // Same body shape as SEMS+ web: POST .../sems-user/api/v1/auth/cross-login
    body: JSON.stringify({
      account: email,
      pwd: hashPasswordForSemsPlus(password),
      agreement: 1,
      isLocal: false,
      isChinese: false,
    }),
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`SEMS+ login returned non-JSON (${response.status}): ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(`SEMS+ login HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  return extractSession(json, region, deviceId);
}
