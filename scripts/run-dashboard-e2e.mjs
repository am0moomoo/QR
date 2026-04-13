import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const rootCwd = process.cwd();
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const apiUrl = process.env.API_URL ?? "http://127.0.0.1:4000";
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const apiHealthUrl = `${apiUrl.replace(/\/$/, "")}/api/v1/health`;
const dashboardUrl = `${appUrl.replace(/\/$/, "")}/dashboard`;
const children = [];
let isCleaningUp = false;

function getPort(url) {
  return Number(new URL(url).port || (url.startsWith("https:") ? "443" : "80"));
}

async function assertPortAvailable(port, host = "127.0.0.1") {
  await new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      reject(error);
    });
    server.once("listening", () => {
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(undefined);
      });
    });
    server.listen(port, host);
  }).catch((error) => {
    throw new Error(
      `Port ${port} is already in use on ${host}. Stop the existing process before running dashboard e2e. Cause: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  });
}

function runProcess(name, args, extraEnv = {}) {
  const child = spawn(
    process.platform === "win32" ? "cmd.exe" : pnpmCommand,
    process.platform === "win32"
      ? ["/d", "/s", "/c", pnpmCommand, ...args]
      : args,
    {
    cwd: rootCwd,
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: "inherit"
    }
  );

  child.on("exit", (code, signal) => {
    if (isCleaningUp || code === 0 || signal === "SIGTERM") {
      return;
    }

    console.error(`${name} exited unexpectedly with code ${code ?? "null"}`);
  });

  children.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 180_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function terminateChild(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore"
      });
      killer.on("exit", () => resolve(undefined));
    });
    return;
  }

  child.kill("SIGTERM");
}

async function cleanup() {
  isCleaningUp = true;
  await Promise.all(children.map((child) => terminateChild(child)));
}

async function main() {
  await assertPortAvailable(getPort(apiUrl));
  await assertPortAvailable(getPort(appUrl));

  console.log(`[dashboard-e2e] starting api server on ${apiUrl}`);
  const apiProcess = runProcess("api", ["--filter", "@qr/api", "start"], {
    API_PORT: process.env.API_PORT ?? "4000"
  });
  console.log(`[dashboard-e2e] starting web server on ${appUrl}`);
  const webProcess = runProcess("web", ["--filter", "@qr/web", "start"]);

  try {
    await waitFor(apiHealthUrl);
    console.log(`[dashboard-e2e] api ready: ${apiHealthUrl}`);
    await waitFor(dashboardUrl);
    console.log(`[dashboard-e2e] web ready: ${dashboardUrl}`);

    const testExitCode = await new Promise((resolve) => {
      const playwright = spawn(
        process.platform === "win32" ? "cmd.exe" : pnpmCommand,
        process.platform === "win32"
          ? [
              "/d",
              "/s",
              "/c",
              pnpmCommand,
              "exec",
              "playwright",
              "test",
              "--workers=1",
              "apps/web/e2e/dashboard.spec.ts"
            ]
          : [
              "exec",
              "playwright",
              "test",
              "--workers=1",
              "apps/web/e2e/dashboard.spec.ts"
            ],
        {
          cwd: rootCwd,
          env: process.env,
          stdio: "inherit"
        }
      );

      playwright.on("exit", (code) => resolve(code ?? 1));
    });

    if (testExitCode !== 0) {
      console.error(`[dashboard-e2e] playwright exited with code ${testExitCode}`);
      process.exitCode = testExitCode;
    }
  } finally {
    await cleanup();
  }

  await Promise.all([apiProcess.exitCode, webProcess.exitCode]);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await cleanup();
});
