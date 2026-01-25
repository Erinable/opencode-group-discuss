import * as fs from "fs";
import * as path from "path";

const LOG_PREFIX = "[GroupDiscuss]";
const LOG_TIMEOUT_MS = 8000;

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LoggerDebugOptions {
  logPrompts: boolean;
  logContext: boolean;
  logCompaction: boolean;
}

export interface LoggerOptions {
  level: LogLevel;
  consoleEnabled: boolean;
  fileEnabled: boolean;
  filePath: string;
  includeMeta: boolean;
  maxEntryChars: number;
  maxMetaChars: number;
}

export interface LoggerConfig {
  logging?: Partial<LoggerOptions>;
  debug?: Partial<LoggerDebugOptions>;
}

/**
 * Lightweight logger that prefers the OpenCode SDK client
 * and falls back to console when the client is unavailable
 * (useful for local tests and offline runs).
 */
export class Logger {
  private client: any;
  private service: string;
  private options: LoggerOptions;
  private debugOptions: LoggerDebugOptions;

  constructor(client?: any, service: string = "group-discuss", config: LoggerConfig = {}) {
    this.client = client;
    this.service = service;

    const defaults: LoggerOptions = {
      level: "info",
      consoleEnabled: true,
      fileEnabled: true,
      filePath: path.resolve(process.cwd(), "group_discuss.log"),
      includeMeta: true,
      maxEntryChars: 8000,
      maxMetaChars: 4000,
    };

    const debugDefaults: LoggerDebugOptions = {
      logPrompts: false,
      logContext: false,
      logCompaction: false,
    };

    this.options = this.applyEnvOverrides({
      ...defaults,
      ...(config.logging || {}),
      filePath: this.resolveFilePath((config.logging || {}).filePath ?? defaults.filePath),
    });

    this.debugOptions = this.applyDebugEnvOverrides({
      ...debugDefaults,
      ...(config.debug || {}),
    });

    // If debug instrumentation is enabled, prefer debug level unless caller explicitly set it.
    if (
      this.debugOptions.logPrompts ||
      this.debugOptions.logContext ||
      this.debugOptions.logCompaction
    ) {
      const envLevel = process.env.GROUP_DISCUSS_LOG_LEVEL as LogLevel | undefined;
      const explicit = (config.logging || {}).level;
      if (!envLevel && !explicit) {
        this.options.level = "debug";
      }
    }
  }

  getLoggingOptions(): LoggerOptions {
    return this.options;
  }

  getDebugOptions(): LoggerDebugOptions {
    return this.debugOptions;
  }

  isEnabled(level: LogLevel): boolean {
    return this.shouldLog(level);
  }

  async info(message: string, meta?: Record<string, any>): Promise<void> {
    await this.log("info", message, meta);
  }

  async warn(message: string, meta?: Record<string, any>): Promise<void> {
    await this.log("warn", message, meta);
  }

  async error(
    message: string,
    error?: unknown,
    meta?: Record<string, any>
  ): Promise<void> {
    const metaWithError = error
      ? { ...(meta || {}), error: this.formatError(error) }
      : meta;
    await this.log("error", message, metaWithError);
  }

  async debug(message: string, meta?: Record<string, any>): Promise<void> {
    await this.log("debug", message, meta);
  }

  private scrubString(value: string): string {
    let out = value;

    // Authorization headers / bearer tokens
    out = out.replace(/Authorization\s*:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]');
    out = out.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');

    // JWTs
    out = out.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]');

    // OpenAI-like keys
    out = out.replace(/sk-[A-Za-z0-9]{20,}/g, 'sk-[REDACTED]');

    // Querystring-ish secrets
    out = out.replace(/\b(api[_-]?key|token|password)=([^&\s]+)/gi, (_m, k) => `${String(k)}=[REDACTED]`);

    return out;
  }

  private scrubAny(value: any, seen: WeakSet<object> = new WeakSet()): any {
    if (value == null) return value;
    if (typeof value === 'string') return this.scrubString(value);
    if (typeof value !== 'object') return value;

    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((v) => this.scrubAny(v, seen));
    }

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = this.scrubAny(v, seen);
    }
    return out;
  }

  private async log(
    level: LogLevel,
    message: string,
    meta?: Record<string, any>
  ): Promise<void> {
    if (!this.shouldLog(level)) return;

    const safeMessage = this.scrubString(message);
    const safeMeta = meta ? (this.scrubAny(meta) as Record<string, any>) : undefined;

    const text = `${LOG_PREFIX} ${safeMessage}`;
    const timestamp = new Date().toISOString();
    const metaString = this.options.includeMeta && safeMeta ? ` | meta=${this.formatMeta(safeMeta)}` : "";
    const rawLine = `${timestamp} [${level.toUpperCase()}] ${text}${metaString}`;
    const fileLogLine = `${this.truncateLine(rawLine, this.options.maxEntryChars)}\n`;

    try {
      if (this.options.fileEnabled) {
        fs.appendFileSync(this.options.filePath, fileLogLine);
      }
    } catch (err) {
      // Silently fail for file logging to not disrupt main flow
    }

    try {
      if (this.client?.app?.log) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), LOG_TIMEOUT_MS);
        try {
          await Promise.race([
            this.client.app.log({
              body: {
                service: this.service,
                level,
                message: text,
                extra: safeMeta, // SDK 使用 extra 而非 metadata
              },
              signal: controller.signal,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("log timeout")), LOG_TIMEOUT_MS)
            ),
          ]);
          clearTimeout(timeout);
          return;
        } catch (err) {
          clearTimeout(timeout);
          throw err;
        }
      }
    } catch (err) {
      this.fallback("error", `log send failed: ${this.formatError(err)}`);
    }

    if (this.options.consoleEnabled) {
      const withMeta = this.options.includeMeta && safeMeta
        ? `${text} | meta=${this.formatMeta(safeMeta)}`
        : text;
      this.fallback(level, this.truncateLine(withMeta, this.options.maxEntryChars));
    }
  }

  private fallback(level: LogLevel, message: string) {
    switch (level) {
      case "error":
        console.error(message);
        break;
      case "warn":
        console.warn(message);
        break;
      default:
        console.log(message);
    }
  }

  private formatMeta(meta: Record<string, any>): string {
    try {
      const json = JSON.stringify(meta, (_key, value) => {
        if (typeof value === "string") {
          return this.truncateLine(value, this.options.maxMetaChars);
        }
        return value;
      });
      return this.truncateLine(this.scrubString(json), this.options.maxMetaChars);
    } catch {
      return String(meta);
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.stack || error.message;
    }
    return typeof error === "string" ? error : JSON.stringify(error);
  }

  private truncateLine(value: string, maxChars: number): string {
    if (!maxChars || maxChars <= 0) return value;
    if (value.length <= maxChars) return value;
    return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
  }

  private resolveFilePath(p: string): string {
    if (!p) return path.resolve(process.cwd(), "group_discuss.log");
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  }

  private shouldLog(level: LogLevel): boolean {
    const order: Record<LogLevel, number> = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
    return order[level] <= order[this.options.level];
  }

  private applyEnvOverrides(options: LoggerOptions): LoggerOptions {
    const env = process.env;

    const debugAll = this.parseEnvBool(env.GROUP_DISCUSS_DEBUG);
    const debugPrompts = this.parseEnvBool(env.GROUP_DISCUSS_DEBUG_PROMPTS);
    const debugContext = this.parseEnvBool(env.GROUP_DISCUSS_DEBUG_CONTEXT);
    const debugCompaction = this.parseEnvBool(env.GROUP_DISCUSS_DEBUG_COMPACTION);
    const wantsDebug = !!(debugAll || debugPrompts || debugContext || debugCompaction);

    const level = env.GROUP_DISCUSS_LOG_LEVEL as LogLevel | undefined;
    const filePath = env.GROUP_DISCUSS_LOG_FILE;
    const fileEnabled = this.parseEnvBool(env.GROUP_DISCUSS_LOG_FILE_ENABLED);
    const consoleEnabled = this.parseEnvBool(env.GROUP_DISCUSS_LOG_CONSOLE_ENABLED);
    const includeMeta = this.parseEnvBool(env.GROUP_DISCUSS_LOG_INCLUDE_META);
    const maxEntryChars = this.parseEnvInt(env.GROUP_DISCUSS_LOG_MAX_ENTRY_CHARS);
    const maxMetaChars = this.parseEnvInt(env.GROUP_DISCUSS_LOG_MAX_META_CHARS);

    return {
      ...options,
      level: level ?? (wantsDebug ? "debug" : options.level),
      fileEnabled: typeof fileEnabled === "boolean" ? fileEnabled : options.fileEnabled,
      consoleEnabled: typeof consoleEnabled === "boolean" ? consoleEnabled : options.consoleEnabled,
      includeMeta: typeof includeMeta === "boolean" ? includeMeta : options.includeMeta,
      maxEntryChars: typeof maxEntryChars === "number" ? maxEntryChars : options.maxEntryChars,
      maxMetaChars: typeof maxMetaChars === "number" ? maxMetaChars : options.maxMetaChars,
      filePath: filePath ? this.resolveFilePath(filePath) : options.filePath,
    };
  }

  private applyDebugEnvOverrides(options: LoggerDebugOptions): LoggerDebugOptions {
    const env = process.env;
    const debugAll = this.parseEnvBool(env.GROUP_DISCUSS_DEBUG);
    const logPrompts = this.parseEnvBool(env.GROUP_DISCUSS_DEBUG_PROMPTS);
    const logContext = this.parseEnvBool(env.GROUP_DISCUSS_DEBUG_CONTEXT);
    const logCompaction = this.parseEnvBool(env.GROUP_DISCUSS_DEBUG_COMPACTION);

    const basePrompts = debugAll ? true : options.logPrompts;
    const baseContext = debugAll ? true : options.logContext;
    const baseCompaction = debugAll ? true : options.logCompaction;

    return {
      ...options,
      logPrompts: typeof logPrompts === "boolean" ? logPrompts : basePrompts,
      logContext: typeof logContext === "boolean" ? logContext : baseContext,
      logCompaction: typeof logCompaction === "boolean" ? logCompaction : baseCompaction,
    };
  }

  private parseEnvBool(value: string | undefined): boolean | undefined {
    if (value == null) return undefined;
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(v)) return true;
    if (["0", "false", "no", "n", "off"].includes(v)) return false;
    return undefined;
  }

  private parseEnvInt(value: string | undefined): number | undefined {
    if (value == null) return undefined;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
  }
}
