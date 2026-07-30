import type { PvStatus } from "../sems/types.js";
import { statusKey } from "../sems/types.js";
import { log } from "../util/logger.js";
import { chunkStatuses, formatBatchStatusPayload, PVOUTPUT_BATCH_LIMIT } from "./batch.js";

const ADD_STATUS = "https://pvoutput.org/service/r2/addstatus.jsp";
const ADD_BATCH = "https://pvoutput.org/service/r2/addbatchstatus.jsp";

/** Free tier: 60 requests/hour; batch packs up to 30 statuses per request. */
const DEFAULT_BATCH_DELAY_MS = 65_000;

export class PvOutputRateLimitError extends Error {
  constructor(
    message: string,
    readonly waitMs: number,
  ) {
    super(message);
    this.name = "PvOutputRateLimitError";
  }
}

export class PvOutputClient {
  private rateLimitedUntilMs = 0;

  constructor(
    private readonly apiKey: string,
    private readonly systemId: string,
    private readonly uploaded: Set<string> = new Set(),
    /** Space requests to stay under 60/hour (docs recommend ≥10s; we default ~65s). */
    private readonly delayMsBetweenBatches = DEFAULT_BATCH_DELAY_MS,
  ) {}

  hasUploaded(status: Pick<PvStatus, "date" | "time">): boolean {
    return this.uploaded.has(statusKey(status));
  }

  markUploaded(statuses: Array<Pick<PvStatus, "date" | "time">>): void {
    for (const status of statuses) this.uploaded.add(statusKey(status));
  }

  async addStatus(status: PvStatus): Promise<boolean> {
    if (this.hasUploaded(status)) return false;
    const body = new URLSearchParams();
    body.set("d", status.date);
    body.set("t", status.time);
    if (status.v1 !== undefined) body.set("v1", String(status.v1));
    if (status.v2 !== undefined) body.set("v2", String(status.v2));
    if (status.v3 !== undefined) body.set("v3", String(status.v3));
    if (status.v4 !== undefined) body.set("v4", String(status.v4));
    if (status.v5 !== undefined) body.set("v5", String(status.v5));
    if (status.v6 !== undefined) body.set("v6", String(status.v6));

    log.debug("PVOutput addstatus", {
      date: status.date,
      time: status.time,
      v1: status.v1,
      v2: status.v2,
      v3: status.v3,
      v4: status.v4,
      v5: status.v5,
      v6: status.v6,
    });

    try {
      await this.postForm(ADD_STATUS, body);
      this.markUploaded([status]);
      return true;
    } catch (error) {
      if (error instanceof PvOutputRateLimitError) {
        log.warn("PVOutput rate limited on addstatus — will retry later", {
          waitMs: error.waitMs,
          date: status.date,
          time: status.time,
        });
        return false;
      }
      throw error;
    }
  }

  async addBatchStatus(statuses: PvStatus[]): Promise<number> {
    const fresh = statuses.filter((status) => !this.hasUploaded(status));
    if (fresh.length === 0) {
      log.debug("PVOutput batch skipped — all statuses already uploaded", {
        total: statuses.length,
      });
      return 0;
    }

    let uploaded = 0;
    const chunks = chunkStatuses(fresh, PVOUTPUT_BATCH_LIMIT);
    log.debug("PVOutput batch upload", {
      fresh: fresh.length,
      chunks: chunks.length,
      batchLimit: PVOUTPUT_BATCH_LIMIT,
      sample: fresh[0],
    });

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex]!;
      const body = new URLSearchParams();
      body.set("data", formatBatchStatusPayload(chunk));

      try {
        await this.postForm(ADD_BATCH, body);
        this.markUploaded(chunk);
        uploaded += chunk.length;
      } catch (error) {
        if (error instanceof PvOutputRateLimitError) {
          const remaining = fresh.length - uploaded;
          log.warn("PVOutput rate limited — pausing uploads, will continue later", {
            waitMs: error.waitMs,
            uploaded,
            remaining,
            chunkIndex,
            chunks: chunks.length,
          });
          this.rateLimitedUntilMs = Date.now() + error.waitMs;
          // Leave remaining unmarked so a later poll/backfill retry can send them.
          return uploaded;
        }
        throw error;
      }

      if (chunkIndex < chunks.length - 1) {
        await sleep(this.delayMsBetweenBatches);
      }
    }
    return uploaded;
  }

  private async waitIfRateLimited(): Promise<void> {
    const waitMs = this.rateLimitedUntilMs - Date.now();
    if (waitMs <= 0) return;
    log.warn("PVOutput still in rate-limit cooldown — waiting", { waitMs });
    await sleep(waitMs);
    this.rateLimitedUntilMs = 0;
  }

  private async postForm(url: string, body: URLSearchParams): Promise<void> {
    await this.waitIfRateLimited();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Pvoutput-Apikey": this.apiKey,
        "X-Pvoutput-SystemId": this.systemId,
        "X-Rate-Limit": "1",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const text = await response.text();
    const remaining = response.headers.get("X-Rate-Limit-Remaining");
    const resetUnix = response.headers.get("X-Rate-Limit-Reset");
    if (remaining !== null || resetUnix !== null) {
      log.debug("PVOutput rate limit headers", { remaining, resetUnix });
    }

    if (isRateLimitResponse(response.status, text)) {
      const waitMs = waitMsFromResetHeader(resetUnix) ?? 15 * 60_000;
      this.rateLimitedUntilMs = Date.now() + waitMs;
      throw new PvOutputRateLimitError(
        `PVOutput rate limited: ${text.trim().slice(0, 200)}`,
        waitMs,
      );
    }

    if (!response.ok) {
      throw new Error(`PVOutput ${url} HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    if (/^ERROR/i.test(text.trim())) {
      throw new Error(`PVOutput error: ${text.trim()}`);
    }
    log.debug("PVOutput ok", { url, body: text.trim().slice(0, 120) });
  }
}

export function isRateLimitResponse(status: number, body: string): boolean {
  if (status === 403 && /exceeded|rate limit|requests per hour/i.test(body)) return true;
  if (/^Forbidden 403: Exceeded/i.test(body.trim())) return true;
  return false;
}

function waitMsFromResetHeader(resetUnix: string | null): number | undefined {
  if (!resetUnix) return undefined;
  const resetSeconds = Number(resetUnix);
  if (!Number.isFinite(resetSeconds)) return undefined;
  // Header is unix seconds when the limit window resets.
  const waitMs = resetSeconds * 1000 - Date.now() + 5_000;
  if (waitMs < 5_000) return 60_000;
  return Math.min(waitMs, 60 * 60_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
