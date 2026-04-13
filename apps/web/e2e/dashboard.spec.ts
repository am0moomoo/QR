import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const apiUrl = (process.env.API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const apiBaseUrl = `${apiUrl}/api/v1`;

async function apiRequest<T>(
  path: string,
  options: {
    body?: unknown;
    method?: "GET" | "PATCH" | "POST";
    token?: string;
  } = {}
) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    method: options.method ?? "GET"
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${path}: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("dashboard list, details, analytics, and settings use live API data", async ({
  page
}) => {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
  const email = `dashboard-${suffix}@example.com`;
  const password = "StrongPass123!";
  const activeTitle = `Alpha Dashboard ${suffix}`;
  const inactiveTitle = `Dormant Dashboard ${suffix}`;

  const registration = await apiRequest<{
    accessToken: string;
    user: { id: string };
  }>("/auth/register", {
    body: {
      email,
      fullName: "Dashboard Owner",
      password
    },
    method: "POST"
  });

  const workspace = await prisma.workspace.findFirstOrThrow({
    where: {
      ownerUserId: registration.user.id
    }
  });

  const design = {
    backgroundColor: "#ffffff",
    cornersInner: "square",
    cornersInnerColor: "#111111",
    cornersOuter: "square",
    cornersOuterColor: "#111111",
    errorCorrection: "M",
    logoAssetId: null,
    logoHideBg: true,
    pattern: "square",
    patternColor: "#111111",
    quietZoneModules: 4,
    sizePx: 512
  };

  const settings = {
    adsEnabled: true,
    doNotIndex: false,
    expiresAt: null,
    isOneTime: false,
    maxScans: null,
    password: null
  };

  const activeQr = await apiRequest<{
    id: string;
    shortUrl: string;
    slug: string;
  }>("/qr-codes", {
    body: {
      content: {
        link: "https://example.com/dashboard-live"
      },
      design,
      exports: ["png", "svg"],
      settings,
      title: activeTitle,
      type: "link",
      workspaceId: workspace.id
    },
    method: "POST",
    token: registration.accessToken
  });

  const inactiveQr = await apiRequest<{
    id: string;
    slug: string;
  }>("/qr-codes", {
    body: {
      content: {
        link: "https://example.com/dashboard-inactive"
      },
      design,
      exports: ["png", "svg"],
      settings,
      title: inactiveTitle,
      type: "link",
      workspaceId: workspace.id
    },
    method: "POST",
    token: registration.accessToken
  });

  await apiRequest(`/qr-codes/${inactiveQr.id}/deactivate`, {
    method: "POST",
    token: registration.accessToken
  });

  await fetch(`${apiUrl}/r/${activeQr.slug}`, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123",
      "X-Country": "US"
    },
    redirect: "manual"
  });

  await page.goto(`${appUrl}/dashboard`);
  await page.locator("#dashboard-email").fill(email);
  await page.locator("#dashboard-password").fill(password);
  await page.locator("form button[type='submit']").click();

  await expect(page.getByRole("heading", { name: "QR list" })).toBeVisible();
  await expect(page.locator("tbody")).toContainText(activeTitle);
  await expect(page.locator("tbody")).toContainText(inactiveTitle);

  await page.locator("#qr-search").fill(activeTitle);
  await expect(page.locator("tbody")).toContainText(activeTitle);
  await expect(page.locator("tbody")).not.toContainText(inactiveTitle);

  await page.locator("#qr-search").fill("");
  await page.locator("#qr-status-filter").selectOption("INACTIVE");
  await expect(page.locator("tbody")).toContainText(inactiveTitle);
  await expect(page.locator("tbody")).not.toContainText(activeTitle);

  await page.locator("#qr-status-filter").selectOption("ALL");
  await page.locator("#qr-sort").selectOption("scans-desc");
  await expect(page.locator("tbody tr").first()).toContainText(activeTitle);

  await page.locator("tbody tr").first().getByRole("link", { name: "Details" }).click();
  await expect(page.getByRole("heading", { name: activeTitle })).toBeVisible();
  await expect(page.locator("main")).toContainText(activeQr.slug);
  await expect(page.locator("main")).toContainText(activeQr.shortUrl);
  await expect(page.locator("main")).toContainText("Unique IPs (30d)");
  await expect(page.getByRole("button", { name: "Download" }).first()).toBeVisible();

  await page.getByRole("link", { name: "Open analytics page" }).click();
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.locator("#analytics-qr")).toHaveValue(activeQr.id);
  await expect(page.locator("main")).toContainText("REDIRECTED");
  await expect(page.locator("main")).toContainText("Scans in range");

  await page.getByRole("link", { name: "Profile & settings" }).click();
  await expect(page.getByRole("heading", { name: "Profile & settings" })).toBeVisible();

  const updatedName = `Dashboard Updated ${suffix}`;
  await page.locator("#settings-full-name").fill(updatedName);
  await page.locator("#settings-avatar-url").fill("https://example.com/dashboard-avatar.png");
  await page.locator("#settings-locale").fill("uz");
  await page.locator("form button[type='submit']").click();

  await expect(page.locator("main")).toContainText("Profile settings saved from the live API.");
  await expect(page.locator("main")).toContainText(updatedName);
  await expect(page.locator("main")).toContainText("https://example.com/dashboard-avatar.png");
  await expect(page.locator("main")).toContainText("uz");
});
