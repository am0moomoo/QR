import type { LogLevel } from "@nestjs/common";

const validLoggerLevels = new Set<LogLevel>([
  "log",
  "error",
  "warn",
  "debug",
  "verbose",
  "fatal"
]);

export function getAppRole() {
  return (process.env.APP_ROLE ?? "api").trim().toLowerCase();
}

export function getQueueDriver() {
  return (process.env.QUEUE_DRIVER ?? "auto").trim().toLowerCase();
}

export function getQueueRole() {
  return (process.env.QUEUE_ROLE ?? "both").trim().toLowerCase();
}

export function getStorageDriver() {
  return (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
}

export function getNestLoggerLevels() {
  const configuredLevels = (process.env.LOG_LEVEL ?? "log,warn,error,debug")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is LogLevel => validLoggerLevels.has(value as LogLevel));

  if (configuredLevels.length > 0) {
    return configuredLevels;
  }

  return ["log", "warn", "error", "debug"] as LogLevel[];
}

export function getWorkerHealthPath() {
  return (process.env.WORKER_HEALTH_PATH ?? "/tmp/qrflow-worker-health.json").trim();
}

export function getWorkerHealthMaxAgeSeconds() {
  const value = Number(process.env.WORKER_HEALTH_MAX_AGE_SECONDS ?? "45");
  return Number.isFinite(value) && value > 0 ? value : 45;
}

export function getRuntimeSummary() {
  return {
    appRole: getAppRole(),
    logLevel: process.env.LOG_LEVEL ?? "log,warn,error,debug",
    monitoringHooksConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
    queueDriver: getQueueDriver(),
    queueRole: getQueueRole(),
    storageDriver: getStorageDriver()
  };
}

export function getRuntimeWarnings() {
  const warnings: string[] = [];
  const isProduction = (process.env.NODE_ENV ?? "development") === "production";

  if (!isProduction) {
    return warnings;
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change-me") {
    warnings.push("JWT_SECRET is using a placeholder value.");
  }

  if (!process.env.IP_HASH_SALT || process.env.IP_HASH_SALT === "change-me") {
    warnings.push("IP_HASH_SALT is using a placeholder value.");
  }

  if (
    !process.env.STRIPE_SECRET_KEY ||
    process.env.STRIPE_SECRET_KEY === "sk_test_mock"
  ) {
    warnings.push("STRIPE_SECRET_KEY is still configured for mock billing.");
  }

  if (
    !process.env.STRIPE_WEBHOOK_SECRET ||
    process.env.STRIPE_WEBHOOK_SECRET === "whsec_mock"
  ) {
    warnings.push("STRIPE_WEBHOOK_SECRET is using the mock default.");
  }

  if (getStorageDriver() === "local") {
    warnings.push("STORAGE_DRIVER is local; object storage is not configured.");
  }

  return warnings;
}
