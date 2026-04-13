import * as assert from "node:assert/strict";
import test = require("node:test");
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
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
import { StorageLifecycleService } from "../common/storage-lifecycle.service";

let app: INestApplication | null = null;
let prisma: PrismaService | null = null;
let redis: RedisService | null = null;
let integrationReady = false;

const requireLiveServices =
  process.env.CI === "true" ||
  process.env.REQUIRE_INTEGRATION_DB === "true";
const requireRealBucket = process.env.REQUIRE_REAL_BUCKET === "true";

process.env.NODE_ENV = "test";
process.env.QUEUE_DRIVER = process.env.QUEUE_DRIVER ?? "bullmq";
process.env.QUEUE_ROLE = process.env.QUEUE_ROLE ?? "both";
process.env.SCAN_WRITE_SYNC = "true";

test.before(async () => {
  if (!process.env.DATABASE_URL) {
    if (requireLiveServices || requireRealBucket) {
      throw new Error(
        "DATABASE_URL must be configured when real-bucket verification is required."
      );
    }

    return;
  }

  if (!process.env.REDIS_URL) {
    if (requireLiveServices || requireRealBucket) {
      throw new Error(
        "REDIS_URL must be configured when real-bucket verification is required."
      );
    }

    return;
  }

  if (!isRealBucketConfigured()) {
    if (requireRealBucket) {
      throw new Error(
        "Real-bucket verification requires STORAGE_DRIVER=s3|r2 and live S3-compatible credentials."
      );
    }

    return;
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
    if (requireLiveServices || requireRealBucket) {
      throw new Error(
        `Real-bucket database is required but unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return;
  }

  if (!redisService.isReady()) {
    if (requireLiveServices || requireRealBucket) {
      throw new Error("Real-bucket Redis is required but unavailable.");
    }

    return;
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
    if (requireRealBucket) {
      throw new Error(
        "Real-bucket verification is required but the integration app is not ready."
      );
    }

    t.skip("Real-bucket verification is not configured in this environment");
    return false;
  }

  return true;
}

test("real bucket smoke: render -> signed downloads -> private access -> cleanup", async (t) => {
  if (!(await ensureIntegrationReady(t))) {
    return;
  }

  const server = app!.getHttpServer();
  const bucket = process.env.S3_BUCKET!.trim();
  const s3 = createS3Client();
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;
  const email = `bucket-${uniqueSuffix}@example.com`;
  const password = "StrongPass123!";

  const registration = await request(server)
    .post("/api/v1/auth/register")
    .send({
      email,
      fullName: "Bucket Smoke Owner",
      password
    })
    .expect(201);

  const workspace = await prisma!.workspace.findFirstOrThrow({
    where: {
      ownerUserId: registration.body.user.id
    }
  });

  const bearerToken = registration.body.accessToken as string;
  const createdQr = await request(server)
    .post("/api/v1/qr-codes")
    .set("Authorization", `Bearer ${bearerToken}`)
    .send({
      content: {
        link: "https://example.com/real-bucket"
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
      title: "Real bucket smoke QR",
      type: "link",
      workspaceId: workspace.id
    })
    .expect(201);

  const qrId = createdQr.body.id as string;
  await request(server)
    .post(`/api/v1/qr-codes/${qrId}/render`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200);

  const assetRows = await prisma!.qRAsset.findMany({
    orderBy: {
      format: "asc"
    },
    where: {
      kind: "QR_IMAGE",
      qrCodeId: qrId
    }
  });

  assert.equal(assetRows.length, 2, "Expected PNG and SVG assets in the real bucket.");
  assert.ok(
    assetRows.every((asset) => asset.storageKey.startsWith("qr/")),
    "Expected QR assets to stay under the qr/ prefix."
  );

  const pngDownload = await request(server)
    .get(`/api/v1/qr-codes/${qrId}/downloads?format=png`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .redirects(0)
    .expect(302);
  const svgDownload = await request(server)
    .get(`/api/v1/qr-codes/${qrId}/downloads?format=svg`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .redirects(0)
    .expect(302);

  const pngLocation = pngDownload.headers.location as string | undefined;
  const svgLocation = svgDownload.headers.location as string | undefined;

  assert.ok(pngLocation, "Expected a signed PNG download URL.");
  assert.ok(svgLocation, "Expected a signed SVG download URL.");

  await verifySignedDownload(pngLocation!, "image/png");
  await verifySignedDownload(svgLocation!, "image/svg+xml");
  await verifyPrivateObjectUrl(pngLocation!);

  const lifecycle = app!.get(StorageLifecycleService);
  const orphanPrefix = `qr/real-bucket-smoke/${uniqueSuffix}/`;
  const orphanKey = `${orphanPrefix}orphan.txt`;

  await s3.send(
    new PutObjectCommand({
      Body: Buffer.from("orphan bucket smoke object"),
      Bucket: bucket,
      Key: orphanKey
    })
  );
  await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: orphanKey
    })
  );

  const dryRun = await lifecycle.cleanupOrphanedQrObjects({
    dryRun: true,
    prefix: orphanPrefix
  });
  assert.deepEqual(dryRun.deleted, []);
  assert.deepEqual(dryRun.orphaned, [orphanKey]);

  const cleanup = await lifecycle.cleanupOrphanedQrObjects({
    prefix: orphanPrefix
  });
  assert.deepEqual(cleanup.deleted, [orphanKey]);
  assert.deepEqual(cleanup.orphaned, [orphanKey]);
  await assertObjectMissing(s3, bucket, orphanKey);

  await request(server)
    .delete(`/api/v1/qr-codes/${qrId}`)
    .set("Authorization", `Bearer ${bearerToken}`)
    .expect(200)
    .expect(({ body }: { body: Record<string, unknown> }) => {
      assert.equal(body.success, true);
    });

  for (const asset of assetRows) {
    await assertObjectMissing(s3, bucket, asset.storageKey);
  }
});

function createS3Client() {
  return new S3Client({
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!.trim()
    },
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    region: process.env.S3_REGION?.trim() || "auto"
  });
}

async function verifySignedDownload(url: string, expectedContentType: string) {
  const response = await fetch(url);

  assert.ok(response.ok, `Signed download failed with HTTP ${response.status}.`);
  assert.match(
    response.headers.get("content-type") ?? "",
    new RegExp(expectedContentType.replace("+", "\\+"))
  );
  assert.ok(
    (await response.arrayBuffer()).byteLength > 0,
    "Signed download body was empty."
  );
}

async function verifyPrivateObjectUrl(signedUrl: string) {
  const unsignedUrl = new URL(signedUrl);
  unsignedUrl.search = "";

  const response = await fetch(unsignedUrl, {
    redirect: "manual"
  });

  assert.ok(
    !response.ok,
    `Expected unsigned object URL to be denied, but it returned HTTP ${response.status}.`
  );
}

async function assertObjectMissing(client: S3Client, bucket: string, key: string) {
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
  } catch (error) {
    if (isMissingObjectError(error)) {
      return;
    }

    throw error;
  }

  assert.fail(`Expected ${key} to be absent from bucket ${bucket}.`);
}

function isRealBucketConfigured() {
  const driver = (process.env.STORAGE_DRIVER ?? "").trim().toLowerCase();

  if (driver !== "s3" && driver !== "r2") {
    return false;
  }

  return [
    process.env.S3_BUCKET,
    process.env.S3_ACCESS_KEY_ID,
    process.env.S3_SECRET_ACCESS_KEY,
    process.env.S3_ENDPOINT
  ].every((value) => Boolean(value?.trim()));
}

function isMissingObjectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    $metadata?: {
      httpStatusCode?: number;
    };
    name?: string;
  };

  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey"
  );
}
