type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m", // cyan — distinct from info
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

let minLevel: LogLevel = "info";
let colorEnabled = true;

export function configureLogger(options: { level?: string; color?: boolean }): void {
  const requested = (options.level ?? "info").trim().toLowerCase();
  if (requested in LEVEL_RANK) {
    minLevel = requested as LogLevel;
  }
  if (options.color !== undefined) {
    colorEnabled = options.color;
  } else {
    colorEnabled = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
  }
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

function write(level: LogLevel, message: string, extra?: unknown): void {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const levelTag = `[${level}]`;
  const payload = extra === undefined ? "" : ` ${safeJson(extra)}`;

  let line: string;
  if (colorEnabled) {
    const color = COLORS[level];
    line = `${DIM}${timestamp}${RESET} ${color}${levelTag}${RESET} ${message}${payload ? `${DIM}${payload}${RESET}` : ""}`;
  } else {
    line = `${timestamp} ${levelTag} ${message}${payload}`;
  }

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Truncate large objects for terminal readability. */
export function summarizeForLog(value: unknown, maxChars = 800): unknown {
  try {
    const text = JSON.stringify(value);
    if (text.length <= maxChars) return value;
    return `${text.slice(0, maxChars)}…(+${text.length - maxChars} chars)`;
  } catch {
    return String(value);
  }
}

export const log = {
  debug: (message: string, extra?: unknown) => write("debug", message, extra),
  info: (message: string, extra?: unknown) => write("info", message, extra),
  warn: (message: string, extra?: unknown) => write("warn", message, extra),
  error: (message: string, extra?: unknown) => write("error", message, extra),
};
