import type { PvStatus } from "../sems/types.js";

export const PVOUTPUT_BATCH_LIMIT = 30;

export function chunkStatuses<T>(items: T[], size: number = PVOUTPUT_BATCH_LIMIT): T[][] {
  if (size < 1) throw new Error("chunk size must be >= 1");
  const chunks: T[][] = [];
  for (let startIndex = 0; startIndex < items.length; startIndex += size) {
    chunks.push(items.slice(startIndex, startIndex + size));
  }
  return chunks;
}

function fieldOrMissing(value: number | undefined): string {
  return value === undefined ? "-1" : String(value);
}

/** date,time,v1,v2,v3,v4[,v5[,v6]] — trailing missing temp/voltage omitted (not -1). */
export function formatBatchStatusLine(status: PvStatus): string {
  const fields = [
    status.date,
    status.time,
    fieldOrMissing(status.v1),
    fieldOrMissing(status.v2),
    fieldOrMissing(status.v3),
    fieldOrMissing(status.v4),
    fieldOrMissing(status.v5),
    fieldOrMissing(status.v6),
  ];
  while (fields.length > 2 && fields[fields.length - 1] === "-1") {
    fields.pop();
  }
  return fields.join(",");
}

export function formatBatchStatusPayload(statuses: PvStatus[]): string {
  return statuses.map(formatBatchStatusLine).join(";");
}
