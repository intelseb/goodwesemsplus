import { loginSemsPlus, semsBrowserHeaders } from "./auth.js";
import { isSuccessCode } from "./codes.js";
import type { RegionConfig } from "./regions.js";
import { sessionTokenHeader, type SemsSession } from "./types.js";
import { log, summarizeForLog } from "../util/logger.js";

export class SemsClient {
  private session: SemsSession | null = null;

  constructor(
    private readonly region: RegionConfig,
    private readonly email: string,
    private readonly password: string,
  ) {}

  async ensureLogin(): Promise<SemsSession> {
    if (!this.session) {
      this.session = await loginSemsPlus(this.region, this.email, this.password);
      log.info("SEMS+ login ok", { api: this.session.api, region: this.session.region });
    }
    return this.session;
  }

  async request<T = unknown>(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
    isRetry = false,
  ): Promise<T> {
    const session = await this.ensureLogin();
    const url = new URL(path.startsWith("http") ? path : `${session.api}${path}`);
    if (options.query) {
      for (const [queryKey, queryValue] of Object.entries(options.query)) {
        url.searchParams.set(queryKey, queryValue);
      }
    }

    const tokenJson = sessionTokenHeader(session);
    log.debug("SEMS request", {
      method,
      url: url.toString(),
      body: options.body === undefined ? undefined : summarizeForLog(options.body, 400),
      retry: isRetry,
    });

    const response = await fetch(url, {
      method,
      headers: {
        ...semsBrowserHeaders(
          this.region.webOrigin,
          tokenJson,
          session.uid,
          session.token,
          session.uuid,
        ),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      log.debug("SEMS non-JSON body", { status: response.status, body: text.slice(0, 300) });
      throw new Error(
        `SEMS gateway non-JSON (${response.status}) ${url.pathname}: ${text.slice(0, 200)}`,
      );
    }

    const responseCode = (json as { code?: unknown }).code;
    const responseMessage = String(
      (json as { msg?: unknown; message?: unknown; errorMsg?: unknown; description?: unknown })
        .msg ??
        (json as { message?: unknown }).message ??
        (json as { errorMsg?: unknown }).errorMsg ??
        (json as { description?: unknown }).description ??
        "",
    );
    const failed = !response.ok || !isSuccessCode(responseCode);

    log.debug("SEMS response", {
      status: response.status,
      code: responseCode,
      message: responseMessage || undefined,
      preview: summarizeForLog(json, 600),
    });

    if (failed) {
      const looksLikeAuthFailure = /login|token|authoriz|signature|expired|C0602|abnormal/i.test(
        responseMessage + String(responseCode),
      );
      if (!isRetry && looksLikeAuthFailure) {
        log.warn("SEMS gateway auth failure, re-login once", {
          path,
          code: responseCode,
          msg: responseMessage,
        });
        this.session = null;
        return this.request(method, path, options, true);
      }
      throw new Error(
        `SEMS gateway ${path} failed: ${responseMessage || response.status} (code=${String(responseCode)})`,
      );
    }

    return json as T;
  }
}
