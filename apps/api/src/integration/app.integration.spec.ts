import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import type { IncomingMessage } from "node:http";
import * as path from "node:path";
import { createHmac } from "node:crypto";
import test = require("node:test");
import {
  type INestApplication
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { AppModule } from "../app.module";
import { configureApiApp } from "../bootstrap-api";
import { PrismaService } from "../common/prisma.service";
import { RedisService } from "../common/redis.service";

let app: INestApplication | null = null;
let prisma: PrismaService | null = null;
let redis: RedisService | null = null;
let integrationReady = false;

const requireLiveServices =
  process.env.CI === "true" ||
  process.env.REQUIRE_INTEGRATION_DB === "true";

process.env.NODE_ENV = "test";
process.env.SCAN_WRITE_SYNC = "true";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_ROOT = "./storage/test-integration";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_mock";
process.env.STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || "whsec_mock";
process.env.STRIPE_PRICE_LITE =
  process.env.STRIPE_PRICE_LITE || "price_lite_test";
process.env.STRIPE_PRICE_PREMIUM =
  process.env.STRIPE_PRICE_PREMIUM || "price_premium_test";

const storageRoot = path.resolve(
  process.cwd(),
  process.env.STORAGE_LOCAL_ROOT ?? "./storage/test-integration"
);

test.before(async () => {
  await fs.rm(storageRoot, { force: true, recursive: true });

  if (!process.env.DATABASE_URL) {
    if (requireLiveServices) {
      throw new Error(
        "DATABASE_URL must be configured when integration verification is required."
      );
    }

    return;
  }

  if (!process.env.REDIS_URL && requireLiveServices) {
    throw new Error(
      "REDIS_URL must be configured when integration verification is required."
    );
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  app = moduleRef.createNestApplication();
  configureApiApp(app);
  await app.init();

  const prismaService = app.get(PrismaService);
  const redisService = app.get(RedisService);
  prisma = prismaService;
  redis = redisService;

  try {
    await prismaService.$queryRaw`SELECT 1`;
  } catch (error) {
    if (requireLiveServices) {
      throw new Error(
        `Integration database is required but unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return;
  }

  if (requireLiveServices && !redisService.isReady()) {
    throw new Error("Integration Redis is required but unavailable.");
  }

  integrationReady = true;
});

test.after(async () => {
  if (app) {
    await app.close();
  }
});

async function ensureIntegrationReady(t: test.TestContext) {
  if (!integrationReady || !app || !prisma) {
    if (requireLiveServices) {
      throw new Error("Integration verification is required but app is not ready.");
    }

    t.skip("Integration database is not available in this environment");
    return false;
  }

  return true;
}

function binaryParser(
  response: IncomingMessage,
  callback: (error: Error | null, body: Buffer) => void
) {
  const chunks: Buffer[] = [];

  response.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  response.on("end", () => {
    callback(null, Buffer.concat(chunks));
  });
}

function textParser(
  response: IncomingMessage,
  callback: (error: Error | null, body: string) => void
) {
  let body = "";
  response.setEncoding("utf8");
  response.on("data", (chunk: string) => {
    body += chunk;
  });
  response.on("end", () => {
    callback(null, body);
  });
}

function createStripeSignatureHeader(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `t=${timestamp},v1=${digest}`;
}

test("integration smoke: auth -> qr flow -> billing upgrade -> quotas -> reset -> profile", async (t) => {
  if (!(await ensureIntegrationReady(t))) {
    return;
  }

  const server = app!.getHttpServer();
  const seededUser = await prisma!.user.findUnique({
    where: {
      email: "demo@qrflow.local"
    }
  });

  assert.ok(
    seededUser,
    "Seeded demo user should exist because CI runs migrate deploy and seed before smoke tests."
  );

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
  const email = `owner-${uniqueSuffix}@example.com`;
  const password = "StrongPass123!";

  const healthResponse = await request(server)
    .get("/api/v1/health")
    .expect(200);

  assert.equal(healthResponse.body.dependencies.database, "up");
  if (process.env.REDIS_URL) {
    assert.equal(healthResponse.body.dependencies.redis, "up");
  }

  const registration = await request(server)
    .post("/api/v1/auth/register")
    .send({
      email,
      fullName: "Owner Example",
      password
    })
    .expect(201);

  assert.equal(registration.body.user.email, email.toLowerCase());
  assert.ok(registration.body.accessToken);

  const workspace = await prisma!.workspace.findFirstOrThrow({
    where: {
      ownerUserId: registration.body.user.id
    }
  });

  const login = await request(server)
    .post("/api/v1/auth/login")
    .send({
      email,
      password
    })
    .expect(200);

  const bearerToken = login.body.accessToken as string;

  await request(server)
    .get("/api/v1/me")
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200)
    .expect(({ body }: { body: Record<string, unknown> }) => {
      assert.equal(body.id, registration.body.user.id);
      assert.equal(body.fullName, "Owner Example");
    });

  const initialBillingSummary = await request(server)
    .get(`/api/v1/billing/summary?workspaceId=${workspace.id}`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200);

  assert.equal(initialBillingSummary.body.currentPlan.code, "free");
  assert.equal(initialBillingSummary.body.quotas.qrCodes.limit, 3);
  assert.equal(initialBillingSummary.body.subscription, null);

  const adsOffRejected = await request(server)
    .post("/api/v1/qr-codes")
    .set("Authorization", `Bearer ${bearerToken}`)
    .send({
      content: {
        link: "https://example.com/ads-off-not-allowed"
      },
      design: {
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
      },
      exports: ["png", "svg"],
      settings: {
        adsEnabled: false,
        doNotIndex: false,
        expiresAt: null,
        isOneTime: false,
        maxScans: null,
        password: null
      },
      title: "Ads off should fail on free",
      type: "link",
      workspaceId: workspace.id
    })
    .expect(403);

  assert.equal(adsOffRejected.body.code, "FORBIDDEN");
  assert.equal(
    adsOffRejected.body.message,
    "Turning off ads is available on the Premium plan only."
  );
  assert.match(adsOffRejected.body.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(
    adsOffRejected.headers["x-request-id"],
    adsOffRejected.body.requestId
  );
  assert.equal("error" in adsOffRejected.body, false);

  const createQr = await request(server)
    .post("/api/v1/qr-codes")
    .set("Authorization", `Bearer ${bearerToken}`)
    .send({
      content: {
        link: "https://example.com/launch"
      },
      design: {
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
      },
      exports: ["png", "svg"],
      settings: {
        adsEnabled: true,
        doNotIndex: false,
        expiresAt: null,
        isOneTime: false,
        maxScans: null,
        password: null
      },
      title: "Launch QR",
      type: "link",
      workspaceId: workspace.id
    })
    .expect(201);

  assert.equal(createQr.body.downloads.length, 2);

  const listResponse = await request(server)
    .get("/api/v1/qr-codes")
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200);

  assert.equal(listResponse.body.total, 1);
  assert.equal(listResponse.body.items.length, 1);
  assert.equal(listResponse.body.items[0].id, createQr.body.id);
  assert.equal(listResponse.body.items[0].type, "link");

  await request(server)
    .get(`/api/v1/qr-codes/${createQr.body.id}`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200)
    .expect(({ body }: { body: Record<string, any> }) => {
      assert.equal(body.id, createQr.body.id);
      assert.equal(body.type, "link");
      assert.equal(body.content.link, "https://example.com/launch");
      assert.equal(body.downloads.length, 2);
    });

  for (const [index, title] of ["Second QR", "Third QR"].entries()) {
    await request(server)
      .post("/api/v1/qr-codes")
      .set("Authorization", `Bearer ${bearerToken}`)
      .send({
        content: {
          link: `https://example.com/free-limit-${index + 2}`
        },
        design: {
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
        },
        exports: ["png", "svg"],
        settings: {
          adsEnabled: true,
          doNotIndex: false,
          expiresAt: null,
          isOneTime: false,
          maxScans: null,
          password: null
        },
        title,
        type: "link",
        workspaceId: workspace.id
      })
      .expect(201);
  }

  await request(server)
    .post("/api/v1/qr-codes")
    .set("Authorization", `Bearer ${bearerToken}`)
    .send({
      content: {
        link: "https://example.com/free-limit-blocked"
      },
      design: {
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
      },
      exports: ["png", "svg"],
      settings: {
        adsEnabled: true,
        doNotIndex: false,
        expiresAt: null,
        isOneTime: false,
        maxScans: null,
        password: null
      },
      title: "Free limit blocked",
      type: "link",
      workspaceId: workspace.id
    })
    .expect(403);

  await request(server)
    .post(`/api/v1/qr-codes/${createQr.body.id}/render`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200)
    .expect(({ body }: { body: Record<string, any> }) => {
      assert.equal(body.accepted, true);
      assert.equal(body.downloads.length, 2);
    });

  const downloadList = await request(server)
    .get(`/api/v1/qr-codes/${createQr.body.id}/downloads`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200);

  assert.equal(downloadList.body.downloads.length, 2);

  const pngDownload = await request(server)
    .get(`/api/v1/qr-codes/${createQr.body.id}/downloads?format=png`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .buffer(true)
    .parse(binaryParser as unknown as (res: any, callback: (err: Error | null, body: any) => void) => void)
    .expect(200);

  assert.match(pngDownload.headers["content-type"] ?? "", /image\/png/);
  assert.ok(Buffer.isBuffer(pngDownload.body));
  assert.ok(pngDownload.body.length > 0);

  const svgDownload = await request(server)
    .get(`/api/v1/qr-codes/${createQr.body.id}/downloads?format=svg`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .buffer(true)
    .parse(textParser as unknown as (res: any, callback: (err: Error | null, body: any) => void) => void)
    .expect(200);

  assert.match(svgDownload.headers["content-type"] ?? "", /image\/svg\+xml/);
  assert.ok(String(svgDownload.body).includes("<svg"));

  const missingPublicScan = await request(server)
    .get(`/r/missing-${uniqueSuffix}`)
    .expect(404);

  assert.match(missingPublicScan.headers["content-type"] ?? "", /text\/html/);
  assert.match(
    missingPublicScan.text,
    /We couldn(?:'|&#039;)t find this QR code/
  );
  assert.match(missingPublicScan.text, /Reference:/);
  assert.match(
    missingPublicScan.headers["x-request-id"] ?? "",
    /^[0-9a-f-]{36}$/i
  );

  await request(server)
    .get(`/r/${createQr.body.slug}`)
    .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123")
    .set("Accept-Language", "en-US,en;q=0.9")
    .set("X-Country", "US")
    .expect(302)
    .expect("Location", "https://example.com/launch");

  const rawEvent = await prisma!.scanEvent.findFirstOrThrow({
    where: {
      qrCodeId: createQr.body.id
    },
    orderBy: {
      scannedAt: "desc"
    }
  });

  assert.equal(rawEvent.outcome, "REDIRECTED");
  assert.equal(rawEvent.country, "US");
  assert.equal(rawEvent.browser, "chrome");
  assert.equal(rawEvent.deviceType, "desktop");

  const dailyAggregate = await prisma!.scanAggregateDaily.findFirstOrThrow({
    where: {
      qrCodeId: createQr.body.id
    }
  });

  assert.equal(dailyAggregate.scans, 1);
  assert.equal(dailyAggregate.uniqueIps, 1);

  const qrRecord = await prisma!.qRCode.findUniqueOrThrow({
    where: {
      id: createQr.body.id
    }
  });

  assert.equal(Number(qrRecord.scansCount), 1);
  assert.ok(qrRecord.lastScanAt);

  const analyticsResponse = await request(server)
    .get(`/api/v1/qr-codes/${createQr.body.id}/analytics`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200);

  assert.equal(analyticsResponse.body.summary.scans, 1);
  assert.equal(analyticsResponse.body.summary.uniqueIps, 1);
  assert.equal(analyticsResponse.body.daily.length, 1);
  assert.equal(analyticsResponse.body.recentEvents[0].outcome, "REDIRECTED");

  const checkoutSession = await request(server)
    .post("/api/v1/billing/checkout-session")
    .set("Authorization", `Bearer ${bearerToken}`)
    .send({
      targetPlan: "premium",
      workspaceId: workspace.id
    })
    .expect(201);

  assert.equal(checkoutSession.body.providerMode, "mock");
  assert.equal(checkoutSession.body.targetPlan, "premium");
  assert.match(checkoutSession.body.checkoutSessionId, /^cs_test_mock_/);

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_mock";
  const checkoutCompletedPayload = JSON.stringify({
    id: "evt_checkout_completed",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: workspace.id,
        customer: checkoutSession.body.stripeCustomerId,
        id: checkoutSession.body.checkoutSessionId,
        metadata: {
          targetPlan: "premium",
          userId: registration.body.user.id,
          workspaceId: workspace.id
        },
        mode: "subscription",
        object: "checkout.session",
        subscription: checkoutSession.body.subscriptionId
      }
    }
  });
  const subscriptionUpdatedPayload = JSON.stringify({
    id: "evt_subscription_updated",
    object: "event",
    type: "customer.subscription.updated",
    data: {
      object: {
        cancel_at_period_end: false,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        customer: checkoutSession.body.stripeCustomerId,
        id: checkoutSession.body.subscriptionId,
        items: {
          data: [
            {
              price: {
                id: process.env.STRIPE_PRICE_PREMIUM
              }
            }
          ]
        },
        metadata: {
          targetPlan: "premium",
          userId: registration.body.user.id,
          workspaceId: workspace.id
        },
        object: "subscription",
        status: "active"
      }
    }
  });
  const invoicePaidPayload = JSON.stringify({
    id: "evt_invoice_paid",
    object: "event",
    type: "invoice.paid",
    data: {
      object: {
        amount_due: 4900,
        created: Math.floor(Date.now() / 1000),
        currency: "usd",
        id: "in_test_premium",
        object: "invoice",
        status: "paid",
        subscription: checkoutSession.body.subscriptionId
      }
    }
  });

  for (const payload of [
    checkoutCompletedPayload,
    subscriptionUpdatedPayload,
    invoicePaidPayload
  ]) {
    await request(server)
      .post("/api/v1/billing/webhooks/stripe")
      .set(
        "Stripe-Signature",
        createStripeSignatureHeader(payload, webhookSecret)
      )
      .set("Content-Type", "application/json")
      .send(payload)
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        assert.equal(body.received, true);
      });
  }

  const premiumBillingSummary = await request(server)
    .get(`/api/v1/billing/summary?workspaceId=${workspace.id}`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200);

  assert.equal(premiumBillingSummary.body.currentPlan.code, "premium");
  assert.equal(premiumBillingSummary.body.subscription.status, "active");
  assert.equal(premiumBillingSummary.body.invoices.length, 1);

  const premiumQr = await request(server)
    .post("/api/v1/qr-codes")
    .set("Authorization", `Bearer ${bearerToken}`)
    .send({
      content: {
        link: "https://example.com/premium-ads-off"
      },
      design: {
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
      },
      exports: ["png", "svg"],
      settings: {
        adsEnabled: false,
        doNotIndex: false,
        expiresAt: null,
        isOneTime: false,
        maxScans: null,
        password: null
      },
      title: "Premium ads off",
      type: "link",
      workspaceId: workspace.id
    })
    .expect(201);

  await request(server)
    .get(`/api/v1/qr-codes/${premiumQr.body.id}`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200)
    .expect(({ body }: { body: Record<string, any> }) => {
      assert.equal(body.adsEnabled, false);
    });

  await request(server)
    .post(`/api/v1/qr-codes/${premiumQr.body.id}/deactivate`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200);

  const inactivePublicScan = await request(server)
    .get(`/r/${premiumQr.body.slug}`)
    .expect(410);

  assert.match(inactivePublicScan.headers["content-type"] ?? "", /text\/html/);
  assert.match(inactivePublicScan.text, /This QR code is inactive/);

  await prisma!.qRAsset.create({
    data: {
      bytes: BigInt(250 * 1024 * 1024),
      checksum: "quota-checksum",
      format: "PNG",
      kind: "QR_IMAGE",
      qrCodeId: premiumQr.body.id,
      storageKey: `quota/${premiumQr.body.id}/existing.png`,
      workspaceId: workspace.id
    }
  });

  await request(server)
    .post("/api/v1/qr-codes")
    .set("Authorization", `Bearer ${bearerToken}`)
    .send({
      content: {
        link: "https://example.com/storage-limit"
      },
      design: {
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
      },
      exports: ["png", "svg"],
      settings: {
        adsEnabled: false,
        doNotIndex: false,
        expiresAt: null,
        isOneTime: false,
        maxScans: null,
        password: null
      },
      title: "Storage limited",
      type: "link",
      workspaceId: workspace.id
    })
    .expect(403);

  const forgotPassword = await request(server)
    .post("/api/v1/auth/forgot-password")
    .send({
      email
    })
    .expect(200);

  assert.ok(forgotPassword.body.resetToken);

  const resetPassword = await request(server)
    .post("/api/v1/auth/reset-password")
    .send({
      password: "EvenStrongerPass123!",
      token: forgotPassword.body.resetToken
    })
    .expect(200);

  const resetToken = resetPassword.body.accessToken as string;
  assert.ok(resetToken);

  await request(server)
    .post("/api/v1/auth/login")
    .send({
      email,
      password
    })
    .expect(401);

  await request(server)
    .post("/api/v1/auth/login")
    .send({
      email,
      password: "EvenStrongerPass123!"
    })
    .expect(200);

  await request(server)
    .patch("/api/v1/me")
    .set("Authorization", `Bearer ${resetToken}`)
    .send({
      avatarUrl: "https://example.com/avatar.png",
      fullName: "Owner Updated",
      locale: "ru"
    })
    .expect(200)
    .expect(({ body }: { body: Record<string, unknown> }) => {
      assert.equal(body.fullName, "Owner Updated");
      assert.equal(body.locale, "ru");
      assert.equal(body.avatarUrl, "https://example.com/avatar.png");
    });
});
