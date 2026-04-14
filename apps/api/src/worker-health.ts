import { readFile } from "node:fs/promises";
import {
  getWorkerHealthMaxAgeSeconds,
  getWorkerHealthPath
} from "./runtime-config";

async function main() {
  const healthPath = getWorkerHealthPath();
  const rawValue = await readFile(healthPath, "utf8");
  const payload = JSON.parse(rawValue) as {
    updatedAt?: string;
  };
  const updatedAt = payload.updatedAt ? Date.parse(payload.updatedAt) : Number.NaN;
  const maxAgeMs = getWorkerHealthMaxAgeSeconds() * 1000;

  if (!Number.isFinite(updatedAt)) {
    throw new Error(`Worker heartbeat at ${healthPath} is missing updatedAt.`);
  }

  if (Date.now() - updatedAt > maxAgeMs) {
    throw new Error(
      `Worker heartbeat at ${healthPath} is stale by more than ${maxAgeMs}ms.`
    );
  }

  console.log(rawValue);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Worker health check failed."
  );
  process.exit(1);
});
