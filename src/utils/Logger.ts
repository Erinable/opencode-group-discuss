import * as fs from "fs";
import * as path from "path";

const LOG_PREFIX = "[GroupDiscuss]";
const LOG_TIMEOUT_MS = 8000;
const LOG_FILE_PATH = path.resolve(process.cwd(), "group_discuss.log");

export type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * Lightweight logger that prefers the OpenCode SDK client
 * and falls back to console when the client is unavailable
 * (useful for local tests and offline runs).
 */
export class Logger {
  private client: any;
  private service: string;

  constructor(client?: any, service: string = "group-discuss") {
    this.client = client;
    this.service = service;
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

  private async log(
    level: LogLevel,
    message: string,
    meta?: Record<string, any>
  ): Promise<void> {
    const text = `${LOG_PREFIX} ${message}`;
    const timestamp = new Date().toISOString();
    const metaString = meta ? ` | meta=${this.formatMeta(meta)}` : "";
    const fileLogLine = `${timestamp} [${level.toUpperCase()}] ${text}${metaString}\n`;

    try {
      fs.appendFileSync(LOG_FILE_PATH, fileLogLine);
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
                extra: meta, // SDK 使用 extra 而非 metadata
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

    const withMeta = meta ? `${text} | meta=${this.formatMeta(meta)}` : text;
    this.fallback(level, withMeta);
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
      return JSON.stringify(meta);
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
}
