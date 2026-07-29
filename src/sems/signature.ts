import { createHash } from "node:crypto";

/** SEMS+ web login expects base64(md5_hex(password)). */
export function hashPasswordForSemsPlus(password: string): string {
  const md5Hex = createHash("md5").update(password, "utf8").digest("hex");
  return Buffer.from(md5Hex, "utf8").toString("base64");
}

/** X-Signature = base64(sha256_hex(`${ts}@${uid}@${token}`) + "@" + ts) */
export function buildXSignature(uid: string, token: string, ts: number = Date.now()): string {
  const hash = createHash("sha256").update(`${ts}@${uid}@${token}`, "utf8").digest("hex");
  return Buffer.from(`${hash}@${ts}`, "utf8").toString("base64");
}
