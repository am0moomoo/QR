import { Injectable, Logger, type LogLevel } from "@nestjs/common";

type LogContext = Record<string, unknown>;

@Injectable()
export class StructuredLoggerService {
  private readonly loggers = new Map<string, Logger>();
  private readonly redactedKeys = [
    "authorization",
    "cookie",
    "password",
    "secret",
    "signature",
    "token"
  ];

  info(event: string, context: LogContext = {}, scope = "app") {
    this.write("log", event, context, scope);
  }

  warn(event: string, context: LogContext = {}, scope = "app") {
    this.write("warn", event, context, scope);
  }

  error(
    event: string,
    error: unknown,
    context: LogContext = {},
    scope = "app"
  ) {
    this.write(
      "error",
      event,
      {
        ...context,
        error: this.serializeError(error)
      },
      scope
    );
  }

  debug(event: string, context: LogContext = {}, scope = "app") {
    this.write("debug", event, context, scope);
  }

  private write(level: LogLevel, event: string, context: LogContext, scope: string) {
    const payload = {
      ...this.sanitize(context),
      event,
      level,
      scope,
      timestamp: new Date().toISOString()
    };

    this.getLogger(scope)[level](this.stringify(payload));
  }

  private getLogger(scope: string) {
    const existing = this.loggers.get(scope);

    if (existing) {
      return existing;
    }

    const logger = new Logger(scope);
    this.loggers.set(scope, logger);
    return logger;
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return this.sanitize({
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }

    return this.sanitize({
      message: String(error)
    });
  }

  private stringify(value: unknown) {
    return JSON.stringify(value, (_, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }

      return currentValue;
    });
  }

  private sanitize<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item)) as T;
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    const sanitized = Object.entries(value as Record<string, unknown>).reduce<
      Record<string, unknown>
    >((accumulator, [key, currentValue]) => {
      accumulator[key] = this.shouldRedactKey(key)
        ? "[REDACTED]"
        : this.sanitize(currentValue);
      return accumulator;
    }, {});

    return sanitized as T;
  }

  private shouldRedactKey(key: string) {
    const normalizedKey = key.trim().toLowerCase();
    return this.redactedKeys.some((candidate) => normalizedKey.includes(candidate));
  }
}
