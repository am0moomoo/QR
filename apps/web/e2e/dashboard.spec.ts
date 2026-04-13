import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const apiUrl = (process.env.API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const apiBaseUrl = `${apiUrl}/api/v1`;

test.setTimeout(90_000);

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
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error(`[browser:${message.type()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    console.error(`[pageerror] ${error.message}`);
  });

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

  await test.step("sign in through the dashboard auth form", async () => {
    await page.goto(`${appUrl}/dashboard`);
    await expect(page.getByTestId("dashboard-auth-form")).toBeVisible();
    await page.locator("#dashboard-email").fill(email);
    await page.locator("#dashboard-password").fill(password);
    await page.getByTestId("dashboard-auth-submit").click();
    await expect(page.getByTestId("qr-list-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "QR list" })).toBeVisible();
  });

  await test.step("render the live QR list with search, filter, and sort", async () => {
    const activeRow = page.getByTestId(`qr-row-${activeQr.id}`);
    const inactiveRow = page.getByTestId(`qr-row-${inactiveQr.id}`);

    await expect(page.getByTestId("qr-list-table")).toBeVisible();
    await expect(activeRow).toContainText(activeTitle);
    await expect(inactiveRow).toContainText(inactiveTitle);

    await page.locator("#qr-search").fill(activeTitle);
    await expect(activeRow).toBeVisible();
    await expect(inactiveRow).toBeHidden();

    await page.locator("#qr-search").fill("");
    await page.locator("#qr-status-filter").selectOption("INACTIVE");
    await expect(inactiveRow).toBeVisible();
    await expect(activeRow).toBeHidden();

    await page.locator("#qr-status-filter").selectOption("ALL");
    await expect(activeRow).toBeVisible();
    await expect(inactiveRow).toBeVisible();

    await page.locator("#qr-sort").selectOption("scans-desc");
    await expect(page.locator("[data-testid^='qr-row-']").first()).toHaveAttribute(
      "data-testid",
      `qr-row-${activeQr.id}`
    );
  });

  await test.step("open QR details and verify live assets and summary", async () => {
    await page.getByTestId(`qr-details-link-${activeQr.id}`).click();
    await expect(page).toHaveURL(`${appUrl}/dashboard/qr/${activeQr.id}`);
    await expect(page.getByTestId("qr-details-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: activeTitle })).toBeVisible();
    await expect(page.getByTestId("qr-details-view")).toContainText(activeQr.slug);
    await expect(page.getByTestId("qr-details-view")).toContainText(activeQr.shortUrl);
    await expect(page.getByTestId("qr-details-summary")).toContainText("Unique IPs (30d)");
    await expect(page.getByTestId("qr-download-png")).toBeVisible();
    await expect(page.getByTestId("qr-download-svg")).toBeVisible();
  });

  await test.step("open analytics page and verify live aggregate data", async () => {
    await page.getByTestId("open-analytics-page").click();
    await expect(page).toHaveURL(`${appUrl}/dashboard/analytics?qr=${activeQr.id}`);
    await expect(page.getByTestId("analytics-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.locator("#analytics-qr")).toHaveValue(activeQr.id);
    await expect(page.getByTestId("analytics-summary")).toContainText("Scans in range");
    await expect(page.getByTestId("analytics-view")).toContainText("REDIRECTED");
  });

  await test.step("open settings and update the real profile", async () => {
    const updatedName = `Dashboard Updated ${suffix}`;

    await page.getByRole("link", { name: "Profile & settings" }).click();
    await expect(page).toHaveURL(`${appUrl}/dashboard/settings`);
    await expect(page.getByTestId("settings-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profile & settings" })).toBeVisible();

    await page.locator("#settings-full-name").fill(updatedName);
    await page.locator("#settings-avatar-url").fill("https://example.com/dashboard-avatar.png");
    await page.locator("#settings-locale").fill("uz");
    await page
      .getByTestId("settings-form")
      .getByRole("button", { name: "Save profile" })
      .click();

    await expect(page.getByTestId("settings-view")).toContainText(
      "Profile settings saved from the live API."
    );
    await expect(page.getByTestId("settings-view")).toContainText(updatedName);
    await expect(page.getByTestId("settings-view")).toContainText(
      "https://example.com/dashboard-avatar.png"
    );
    await expect(page.getByTestId("settings-view")).toContainText("uz");
  });
});
