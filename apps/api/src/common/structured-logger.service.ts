import { Injectable, Logger, type LogLevel } from "@nestjs/common";

type LogContext = Record<string, unknown>;

@Injectable()
export class StructuredLoggerService {
  private readonly loggers = new Map<string, Logger>();

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
      ...context,
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
      return {
        message: error.message,
        name: error.name,
        stack: error.stack
      };
    }

    return {
      message: String(error)
    };
  }

  private stringify(value: unknown) {
    return JSON.stringify(value, (_, currentValue) => {
      if (typeof currentValue === "bigint") {
        return currentValue.toString();
      }

      return currentValue;
    });
  }
}
