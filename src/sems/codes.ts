/** GoodWe often returns success as 0, "0", or zero-padded "00000". */
export function isSuccessCode(code: unknown): boolean {
  if (code === undefined || code === null) return true;
  if (code === 0 || code === 200) return true;
  if (typeof code === "string") {
    const normalized = code.replace(/^0+/, "") || "0";
    return normalized === "0" || normalized === "200";
  }
  return false;
}
