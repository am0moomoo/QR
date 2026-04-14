import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";

const prisma = new PrismaClient();
const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const apiUrl = (process.env.API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const apiBaseUrl = `${apiUrl}/api/v1`;

test.setTimeout(120_000);

async function apiRequest<T>(
  path: string,
  options: {
    body?: BodyInit | unknown;
    headers?: Record<string, string>;
    method?: "GET" | "PATCH" | "POST";
    rawBody?: boolean;
    token?: string;
  } = {}
) {
  const body =
    options.body === undefined
      ? undefined
      : options.rawBody
        ? (options.body as BodyInit)
        : JSON.stringify(options.body);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    body,
    headers: {
      ...(options.body === undefined
        ? {}
        : options.rawBody
          ? {}
          : { "Content-Type": "application/json" }),
      ...(options.headers ?? {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    method: options.method ?? "GET"
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${path}: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

function createStripeSignatureHeader(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `t=${timestamp},v1=${digest}`;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("dashboard growth flow uses live API data across workspaces, folders, custom domains, billing, and settings", async ({
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
  const email = `dashboard-growth-${suffix}@example.com`;
  const password = "StrongPass123!";
  const workspaceName = `Growth Workspace ${suffix}`;
  const folderName = `Spring Launch ${suffix}`;
  const customDomain = `go-${suffix}.example.com`;
  const activeTitle = `Alpha Dashboard ${suffix}`;
  const inactiveTitle = `Dormant Dashboard ${suffix}`;
  const importedTitle = `Imported Dashboard ${suffix}`;
  const premiumTitle = `Premium Dashboard ${suffix}`;

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

  let growthWorkspaceId = "";
  let folderId = "";
  let activeQr!: {
    id: string;
    shortUrl: string;
    slug: string;
  };
  let inactiveQr!: {
    id: string;
  };
  let duplicatedQr!: {
    id: string;
  };

  await test.step("sign in through the dashboard auth form", async () => {
    await page.goto(`${appUrl}/dashboard`);
    await expect(page.getByTestId("dashboard-auth-form")).toBeVisible();
    await page.locator("#dashboard-email").fill(email);
    await page.locator("#dashboard-password").fill(password);
    await page.getByTestId("dashboard-auth-submit").click();
    await expect(page.getByTestId("qr-list-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No QR codes yet" })).toBeVisible();
  });

  await test.step("create a dedicated workspace and folder from the dashboard", async () => {
    await page.getByTestId("workspace-name").fill(workspaceName);
    await page.getByTestId("workspace-create").click();
    await expect(page.getByTestId("qr-list-view")).toContainText(`Workspace "${workspaceName}" is ready.`);
    await expect(page.getByTestId("workspace-select")).toHaveValue(/.+/);

    const workspaces = await apiRequest<{
      items: Array<{ id: string; name: string }>;
    }>("/workspaces", {
      token: registration.accessToken
    });
    const createdWorkspace = workspaces.items.find(
      (workspace) => workspace.name === workspaceName
    );

    if (!createdWorkspace) {
      throw new Error("Workspace created from the dashboard was not returned by the API.");
    }

    growthWorkspaceId = createdWorkspace.id;
    await page.getByTestId("workspace-select").selectOption(growthWorkspaceId);

    await page.getByTestId("folder-name").fill(folderName);
    await page.getByTestId("folder-create").click();
    await expect(page.getByTestId("qr-list-view")).toContainText(`Folder "${folderName}" is ready.`);

    const folders = await apiRequest<{
      items: Array<{ id: string; name: string }>;
    }>(`/workspaces/${growthWorkspaceId}/folders`, {
      token: registration.accessToken
    });
    const createdFolder = folders.items.find((folder) => folder.name === folderName);

    if (!createdFolder) {
      throw new Error("Folder created from the dashboard was not returned by the API.");
    }

    folderId = createdFolder.id;
    await page.getByTestId("folder-select").selectOption(folderId);
  });

  await test.step("connect and verify a custom domain from settings", async () => {
    await page.goto(`${appUrl}/dashboard/settings`);
    await expect(page.getByTestId("settings-view")).toBeVisible();
    await page.getByTestId("settings-workspace").selectOption(growthWorkspaceId);
    await page.getByTestId("custom-domain-input").fill(customDomain);
    await page.getByTestId("custom-domain-create").click();
    await expect(page.getByTestId("custom-domains-view")).toContainText(
      "Custom domain saved. Complete verification to use it in short URLs."
    );

    const domains = await apiRequest<{
      items: Array<{ domain: string; id: string }>;
    }>(`/workspaces/${growthWorkspaceId}/custom-domains`, {
      token: registration.accessToken
    });
    const createdDomain = domains.items.find((item) => item.domain === customDomain);

    if (!createdDomain) {
      throw new Error("Custom domain created from settings was not returned by the API.");
    }

    await page.getByTestId(`custom-domain-verify-${createdDomain.id}`).click();
    await expect(page.getByTestId("custom-domains-view")).toContainText(
      "Custom domain verified. New QR downloads now use the branded short host."
    );
    await expect(page.getByTestId(`custom-domain-${createdDomain.id}`)).toContainText("verified");
  });

  await test.step("create a real QR through the generator in the selected workspace and folder", async () => {
    await page.goto(`${appUrl}/generator`);
    await expect(page.getByTestId("generator-view")).toBeVisible();
    await page.locator("#generator-workspace").selectOption(growthWorkspaceId);
    await page.locator("#generator-folder").selectOption(folderId);
    await page.getByTestId("generator-title").fill(activeTitle);
    await page.getByTestId("generator-link").fill("https://example.com/dashboard-live");
    await page.getByTestId("generator-submit").click();

    await expect(page.getByTestId("generator-created-result")).toBeVisible();
    await expect(page.getByTestId("generator-created-result")).toContainText(activeTitle);
    await expect(page.getByTestId("generator-created-result")).toContainText(workspaceName);
    await expect(page.getByTestId("generator-created-result")).toContainText(folderName);
    await expect(page.getByTestId("generator-created-result")).toContainText(customDomain);

    activeQr = await apiRequest<{
      items: Array<{
        id: string;
        shortUrl: string;
        slug: string;
        title: string | null;
      }>;
    }>(`/qr-codes?workspaceId=${growthWorkspaceId}`, {
      token: registration.accessToken
    }).then((response) => {
      const createdItem = response.items.find(
        (item) => item.title === activeTitle
      );

      if (!createdItem) {
        throw new Error("Generator-created QR was not returned by the live list API.");
      }

      return createdItem;
    });

    expect(activeQr.shortUrl).toContain(customDomain);
  });

  await test.step("show the created QR in the dashboard and support bulk export/import", async () => {
    await page.getByRole("link", { name: "Open dashboard" }).click();
    await expect(page).toHaveURL(`${appUrl}/dashboard`);
    await page.getByTestId("workspace-select").selectOption(growthWorkspaceId);
    await page.getByTestId("folder-select").selectOption(folderId);
    await expect(page.getByTestId(`qr-row-${activeQr.id}`)).toBeVisible();

    const [exportDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("qr-export-json").click()
    ]);

    expect(exportDownload.suggestedFilename()).toContain(".json");

    await page.getByTestId("qr-import-format").selectOption("csv");
    await page.getByTestId("qr-import-data").fill(
      `title,link\n${importedTitle},https://example.com/imported-dashboard`
    );
    await page.getByTestId("qr-import-submit").click();
    await expect(page.getByTestId("qr-list-view")).toContainText("Imported 1 QR code.");
  });

  await test.step("create a second inactive QR through the API for list filtering and analytics setup", async () => {
    inactiveQr = await apiRequest<{
      id: string;
    }>("/qr-codes", {
      body: {
        content: {
          link: "https://example.com/dashboard-inactive"
        },
        design,
        exports: ["png", "svg"],
        folderId,
        settings,
        title: inactiveTitle,
        type: "link",
        workspaceId: growthWorkspaceId
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
        Host: customDomain,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123",
        "X-Country": "US"
      },
      redirect: "manual"
    });

    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByTestId("qr-list-table")).toContainText(importedTitle);
    await expect(page.getByTestId(`qr-row-${inactiveQr.id}`)).toBeVisible();
  });

  await test.step("render the live QR list with search, workspace folder filter, and sort", async () => {
    const activeRow = page.getByTestId(`qr-row-${activeQr.id}`);
    const inactiveRow = page.getByTestId(`qr-row-${inactiveQr.id}`);

    await expect(page.getByTestId("qr-list-table")).toBeVisible();
    await expect(activeRow).toContainText(activeTitle);
    await expect(activeRow).toContainText(folderName);
    await expect(inactiveRow).toContainText(inactiveTitle);

    await page.locator("#qr-search").fill(activeTitle);
    await expect(activeRow).toBeVisible();
    await expect(inactiveRow).toBeHidden();

    await page.locator("#qr-search").fill("");
    await page.locator("#qr-status-filter").selectOption("INACTIVE");
    await expect(inactiveRow).toBeVisible();
    await expect(activeRow).toBeHidden();

    await page.locator("#qr-status-filter").selectOption("ALL");
    await page.locator("#qr-sort").selectOption("scans-desc");
    await expect(page.locator("[data-testid^='qr-row-']").first()).toHaveAttribute(
      "data-testid",
      `qr-row-${activeQr.id}`
    );
  });

  await test.step("open QR details and verify folder, workspace, custom domain, and downloads", async () => {
    await page.getByTestId(`qr-details-link-${activeQr.id}`).click();
    await expect(page).toHaveURL(`${appUrl}/dashboard/qr/${activeQr.id}`);
    await expect(page.getByTestId("qr-details-view")).toBeVisible();
    await expect(page.getByRole("heading", { name: activeTitle })).toBeVisible();
    await expect(page.getByTestId("qr-details-view")).toContainText(activeQr.slug);
    await expect(page.getByTestId("qr-details-view")).toContainText(activeQr.shortUrl);
    await expect(page.getByTestId("qr-details-view")).toContainText(workspaceName);
    await expect(page.getByTestId("qr-details-view")).toContainText(folderName);
    await expect(page.getByTestId("qr-details-view")).toContainText(customDomain);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("qr-download-png").click()
    ]);

    expect(download.suggestedFilename()).toContain(".png");
  });

  await test.step("open analytics page and verify live aggregate data", async () => {
    await page.getByTestId("open-analytics-page").click();
    await expect(page).toHaveURL(`${appUrl}/dashboard/analytics?qr=${activeQr.id}`);
    await expect(page.getByTestId("analytics-view")).toBeVisible();
    await expect(page.locator("#analytics-qr")).toHaveValue(activeQr.id);
    await expect(page.getByTestId("analytics-summary")).toContainText("Scans in range");
    await expect(page.getByTestId("analytics-view")).toContainText("REDIRECTED");
  });

  await test.step("show the current free plan and enforce the free QR limit on the selected workspace", async () => {
    await page.goto(`${appUrl}/dashboard/billing`);
    await expect(page.getByTestId("billing-view")).toBeVisible();
    await page.getByTestId("billing-workspace").selectOption(growthWorkspaceId);
    await expect(page.getByTestId("billing-view")).toContainText(workspaceName);
    await expect(page.getByTestId("billing-summary")).toContainText("Free");
    await expect(page.getByTestId("billing-summary")).toContainText("3 / 3");

    await page.getByRole("link", { name: "Create QR" }).click();
    await expect(page).toHaveURL(`${appUrl}/generator`);
    await page.locator("#generator-workspace").selectOption(growthWorkspaceId);
    await page.locator("#generator-folder").selectOption(folderId);
    await page.getByTestId("generator-title").fill(`Blocked ${suffix}`);
    await page.getByTestId("generator-link").fill("https://example.com/free-limit-blocked");
    await page.getByTestId("generator-submit").click();
    await expect(page.getByTestId("generator-view")).toContainText(
      "Free allows up to 3 active QR codes. Upgrade to continue creating more."
    );
  });

  await test.step("upgrade in billing test mode, sync webhooks, and unlock more capacity", async () => {
    await page.goto(`${appUrl}/dashboard/billing`);
    await expect(page.getByTestId("billing-view")).toBeVisible();
    await page.getByTestId("billing-workspace").selectOption(growthWorkspaceId);
    await page.getByTestId("billing-select-premium").click();
    await expect(page).toHaveURL(/\/dashboard\/billing\?checkout_session_id=/);
    await expect(page.getByTestId("billing-checkout-return")).toBeVisible();

    const checkoutSessionId = new URL(page.url()).searchParams.get("checkout_session_id");
    expect(checkoutSessionId).toBeTruthy();

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "whsec_mock";
    const checkoutCompletedPayload = JSON.stringify({
      id: "evt_checkout_completed_browser_growth",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: growthWorkspaceId,
          customer: `cus_test_mock_${suffix}`,
          id: checkoutSessionId,
          metadata: {
            targetPlan: "premium",
            userId: registration.user.id,
            workspaceId: growthWorkspaceId
          },
          mode: "subscription",
          object: "checkout.session",
          subscription: `sub_test_mock_${suffix}`
        }
      }
    });
    const subscriptionUpdatedPayload = JSON.stringify({
      id: "evt_subscription_updated_browser_growth",
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          cancel_at_period_end: false,
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          customer: `cus_test_mock_${suffix}`,
          id: `sub_test_mock_${suffix}`,
          items: {
            data: [
              {
                price: {
                  id: process.env.STRIPE_PRICE_PREMIUM?.trim() || "price_premium_test"
                }
              }
            ]
          },
          metadata: {
            targetPlan: "premium",
            userId: registration.user.id,
            workspaceId: growthWorkspaceId
          },
          object: "subscription",
          status: "active"
        }
      }
    });
    const invoicePaidPayload = JSON.stringify({
      id: "evt_invoice_paid_browser_growth",
      object: "event",
      type: "invoice.paid",
      data: {
        object: {
          amount_due: 4900,
          created: Math.floor(Date.now() / 1000),
          currency: "usd",
          id: `in_test_${suffix}`,
          object: "invoice",
          status: "paid",
          subscription: `sub_test_mock_${suffix}`
        }
      }
    });

    for (const payload of [
      checkoutCompletedPayload,
      subscriptionUpdatedPayload,
      invoicePaidPayload
    ]) {
      await apiRequest("/billing/webhooks/stripe", {
        body: payload,
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": createStripeSignatureHeader(payload, webhookSecret)
        },
        method: "POST",
        rawBody: true
      });
    }

    await page.reload();
    await expect(page.getByTestId("billing-summary")).toContainText("Premium");
    await expect(page.getByTestId("billing-summary")).toContainText("3 / 250");
    await expect(page.getByTestId("billing-invoices-table")).toContainText("paid");

    await page.getByRole("link", { name: "Create QR" }).click();
    await expect(page).toHaveURL(`${appUrl}/generator`);
    await page.locator("#generator-workspace").selectOption(growthWorkspaceId);
    await page.locator("#generator-folder").selectOption(folderId);
    await page.getByTestId("generator-title").fill(premiumTitle);
    await page.getByTestId("generator-link").fill("https://example.com/premium-after-upgrade");
    await page.getByTestId("generator-submit").click();
    await expect(page.getByTestId("generator-created-result")).toContainText(premiumTitle);
  });

  await test.step("open settings and update the real profile", async () => {
    const updatedName = `Dashboard Updated ${suffix}`;

    await page.goto(`${appUrl}/dashboard/settings`);
    await expect(page).toHaveURL(`${appUrl}/dashboard/settings`);
    await expect(page.getByTestId("settings-view")).toBeVisible();

    await page.locator("#settings-full-name").fill(updatedName);
    await page.locator("#settings-avatar-url").fill("https://example.com/dashboard-avatar.png");
    await page.locator("#settings-locale").fill("uz");
    await page
      .getByTestId("settings-form")
      .getByRole("button", { name: "Save profile" })
      .click();

    await expect(page.getByTestId("settings-view")).toContainText("Profile updated.");
    await expect(page.getByTestId("settings-view")).toContainText(updatedName);
    await expect(page.getByTestId("settings-view")).toContainText(
      "https://example.com/dashboard-avatar.png"
    );
    await expect(page.getByTestId("settings-view")).toContainText("uz");
  });

  await test.step("duplicate, archive, and delete a QR from the dashboard list", async () => {
    await page.goto(`${appUrl}/dashboard`);
    await page.getByTestId("workspace-select").selectOption(growthWorkspaceId);
    await expect(page.getByTestId(`qr-row-${activeQr.id}`)).toBeVisible();

    await page.getByTestId(`qr-duplicate-${activeQr.id}`).click();
    await expect(page.getByTestId("qr-list-view")).toContainText(
      "A copy of the QR code is ready in your list."
    );

    duplicatedQr = await apiRequest<{
      items: Array<{
        id: string;
        title: string | null;
        workspaceId: string;
      }>;
    }>(`/qr-codes?workspaceId=${growthWorkspaceId}`, {
      token: registration.accessToken
    }).then((response) => {
      const createdItem = response.items.find(
        (item) => item.title === `${activeTitle} copy`
      );

      if (!createdItem) {
        throw new Error("Duplicated QR was not returned by the live list API.");
      }

      return createdItem;
    });

    await expect(page.getByTestId(`qr-row-${duplicatedQr.id}`)).toBeVisible();
    await page.getByTestId(`qr-archive-${duplicatedQr.id}`).click();
    await expect(page.getByTestId(`qr-row-${duplicatedQr.id}`)).toContainText("archived");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId(`qr-delete-${duplicatedQr.id}`).click();
    await expect(page.getByTestId(`qr-row-${duplicatedQr.id}`)).toBeHidden();
  });

  await test.step("logout and keep protected routes usable", async () => {
    await page.getByTestId("dashboard-logout").click();
    await expect(page.getByTestId("dashboard-auth-form")).toBeVisible();
    await page.goto(`${appUrl}/dashboard/analytics`);
    await expect(page.getByTestId("dashboard-auth-form")).toBeVisible();
  });
});
