import * as assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import type { IncomingMessage } from "node:http";
import * as path from "node:path";
import test = require("node:test");
import {
  RequestMethod,
  type INestApplication,
  ValidationPipe
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import { AppModule } from "../app.module";
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
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { method: RequestMethod.GET, path: "r/:slug" },
      { method: RequestMethod.POST, path: "r/:slug/password" },
      { method: RequestMethod.GET, path: "inactive" },
      { method: RequestMethod.GET, path: "landing/:slug" }
    ]
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );
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

test("integration smoke: register -> login -> create link QR -> list -> get -> download -> scan -> analytics -> forgot/reset -> profile", async (t) => {
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
