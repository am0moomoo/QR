import * as assert from "node:assert/strict";
import test = require("node:test");
import { hash } from "bcryptjs";
import type { Request } from "express";
import { AssetFormat } from "@prisma/client";
import { AuthService } from "./modules/auth/auth.service";
import { QrCodesService } from "./modules/qr-codes/qr-codes.service";
import { ScanService } from "./modules/scan/scan.service";

const telemetry = {
  track() {
    return undefined;
  }
};

const logger = {
  debug() {
    return undefined;
  },
  error() {
    return undefined;
  },
  info() {
    return undefined;
  },
  warn() {
    return undefined;
  }
};

const analytics = {
  async getQrAnalytics() {
    return {
      daily: [],
      recentEvents: [],
      summary: {
        scans: 0,
        uniqueDevices: 0,
        uniqueIps: 0
      }
    };
  },
  recordScanEvent() {
    return Promise.resolve();
  }
};

function createSlugCache() {
  const values = new Map<string, unknown>();

  return {
    async delete(key: string) {
      values.delete(key);
    },
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async set(key: string, value: unknown) {
      values.set(key, value);
    }
  };
}

function createStorageStub() {
  const files = new Map<string, Buffer>();

  return {
    async deleteObject(storageKey: string) {
      files.delete(storageKey);
    },
    async deleteObjects(storageKeys: string[]) {
      for (const storageKey of storageKeys) {
        files.delete(storageKey);
      }
    },
    async getSignedDownloadUrl() {
      return null;
    },
    async getObject(storageKey: string) {
      const body = files.get(storageKey);

      if (!body) {
        throw new Error(`Missing object: ${storageKey}`);
      }

      return {
        absolutePath: storageKey,
        body,
        bytes: BigInt(body.byteLength)
      };
    },
    async listObjects() {
      return [...files.keys()].map((key) => ({
        key
      }));
    },
    async putObject(storageKey: string, body: Buffer | string) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      files.set(storageKey, buffer);
      return {
        absolutePath: storageKey,
        bytes: BigInt(buffer.byteLength)
      };
    }
  };
}

test("AuthService.register creates a default workspace and returns a bearer token", async () => {
  let createdWorkspaceSlug = "";

  const prisma = {
    session: {
      create: async ({ data }: { data: { expiresAt: Date; tokenHash: string; userId: string } }) => ({
        ...data,
        createdAt: new Date(),
        id: "session-1",
        lastUsedAt: null,
        revokedAt: null
      })
    },
    user: {
      findUnique: async () => null
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        user: {
          create: async ({ data }: { data: { email: string; fullName: string | null; passwordHash: string } }) => ({
            avatarUrl: null,
            createdAt: new Date(),
            email: data.email,
            fullName: data.fullName,
            id: "user-1",
            locale: "en",
            passwordHash: data.passwordHash,
            updatedAt: new Date()
          })
        },
        workspace: {
          findUnique: async () => null,
          create: async ({ data }: { data: { name: string; ownerUserId: string; slug: string } }) => {
            createdWorkspaceSlug = data.slug;

            return {
              ...data,
              createdAt: new Date(),
              id: "workspace-1",
              plan: "FREE",
              updatedAt: new Date()
            };
          }
        },
        workspaceMember: {
          create: async ({ data }: { data: { role: string; userId: string; workspaceId: string } }) => ({
            ...data,
            createdAt: new Date(),
            id: "member-1"
          })
        }
      })
  };

  const service = new AuthService(prisma as any, telemetry as any);
  const result = await service.register({
    email: "Test.User@example.com",
    fullName: "Test User",
    password: "StrongPass123"
  });

  assert.equal(result.user.email, "test.user@example.com");
  assert.equal(result.user.fullName, "Test User");
  assert.equal(result.user.avatarUrl, null);
  assert.equal(createdWorkspaceSlug, "test-user");
  assert.ok(result.accessToken.length > 20);
});

test("AuthService.forgotPassword issues a reset token in non-production mode", async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        avatarUrl: null,
        createdAt: new Date(),
        email: "owner@example.com",
        fullName: "Owner",
        id: "user-1",
        locale: "en",
        passwordHash: "hash",
        updatedAt: new Date()
      })
    },
    $transaction: async (handler: (tx: any) => Promise<unknown>) =>
      handler({
        passwordResetToken: {
          create: async () => undefined,
          updateMany: async () => undefined
        }
      })
  };

  const service = new AuthService(prisma as any, telemetry as any);
  const result = await service.forgotPassword({
    email: "owner@example.com"
  });

  assert.equal(result.success, true);
  assert.ok(result.resetToken);
});

test("QrCodesService.create renders real download assets and returns stable short URLs", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const qrCodeId = "22222222-2222-4222-8222-222222222222";
  const assets: Array<Record<string, unknown>> = [];
  const slugCache = createSlugCache();
  const storage = createStorageStub();
  const findUniqueOrThrow = async () => ({
    adsEnabled: true,
    archivedAt: null,
    assets: assets.map((asset, index) => ({
      bytes: asset.bytes ? BigInt(String(asset.bytes)) : null,
      checksum: asset.checksum,
      createdAt: new Date(),
      format: asset.format,
      heightPx: asset.heightPx,
      id: `asset-${index + 1}`,
      kind: "QR_IMAGE",
      publicUrl: asset.publicUrl,
      qrCodeId,
      storageKey: asset.storageKey,
      widthPx: asset.widthPx,
      workspaceId
    })),
    content: {
      createdAt: new Date(),
      payload: {
        link: "https://example.com/spring"
      },
      qrCodeId,
      schemaVersion: 1,
      targetUrl: "https://example.com/spring",
      updatedAt: new Date()
    },
    createdAt: new Date(),
    deletedAt: null,
    design: {
      backgroundColor: "#ffffff",
      cornersInner: "square",
      cornersInnerColor: "#111111",
      cornersOuter: "square",
      cornersOuterColor: "#111111",
      createdAt: new Date(),
      errorCorrection: "M",
      frameId: null,
      logoAssetId: null,
      logoHideBg: true,
      logoMargin: 0,
      logoSizeRatio: null,
      pattern: "square",
      patternColor: "#111111",
      qrCodeId,
      quietZoneModules: 4,
      sizePx: 512,
      updatedAt: new Date()
    },
    doNotIndex: false,
    expiresAt: null,
    folderId: null,
    id: qrCodeId,
    isOneTime: false,
    lastScanAt: null,
    maxScans: null,
    ownerUserId: "user-1",
    passwordHash: null,
    redirectRules: [],
    scansCount: BigInt(0),
    slug: "Ab12Cd34",
    status: "ACTIVE",
    title: "Spring campaign",
    type: "link",
    updatedAt: new Date(),
    workspace: {
      createdAt: new Date(),
      id: workspaceId,
      name: "Workspace",
      ownerUserId: "user-1",
      plan: "FREE",
      slug: "workspace",
      updatedAt: new Date()
    },
    workspaceId
  });
  const prisma = {
    folder: {
      findFirst: async () => null
    },
    qRCode: {
      findFirst: findUniqueOrThrow,
      findUnique: async () => null,
      findUniqueOrThrow
    },
    workspace: {
      findFirst: async () => ({
        createdAt: new Date(),
        id: workspaceId,
        name: "Workspace",
        ownerUserId: "user-1",
        plan: "FREE",
        slug: "workspace",
        updatedAt: new Date()
      })
    },
    $transaction: async (handler: ((tx: any) => Promise<unknown>) | unknown[]) => {
      if (Array.isArray(handler)) {
        return Promise.all(handler);
      }

      return handler({
        qRAsset: {
          createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
            assets.splice(0, assets.length, ...data);
            return { count: data.length };
          },
          deleteMany: async () => ({ count: assets.length })
        },
        qRCode: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            ...data,
            archivedAt: null,
            createdAt: new Date(),
            deletedAt: null,
            id: qrCodeId,
            lastScanAt: null,
            scansCount: BigInt(0),
            status: "ACTIVE",
            updatedAt: new Date()
          }),
          findUniqueOrThrow
        },
        qRContent: {
          create: async () => undefined
        },
        qRDesign: {
          create: async () => undefined
        }
      });
    }
  };
  const qrRender = {
    async render({ format }: { format: "png" | "svg" }) {
      return {
        body: Buffer.from(`${format}-body`),
        bytes: BigInt(9),
        checksum: `checksum-${format}`,
        contentType: format === "png" ? "image/png" : "image/svg+xml",
        extension: format,
        fileName: `Ab12Cd34.${format}`,
        format: format === "png" ? AssetFormat.PNG : AssetFormat.SVG,
        heightPx: 512,
        widthPx: 512
      };
    }
  };

  const assetPipeline = {
    getExistingExportFormats() {
      return ["png", "svg"];
    }
  };
  const renderQueue = {
    async render() {
      const renderedAssets = await Promise.all(
        (["png", "svg"] as const).map(async (format) => {
          const rendered = await qrRender.render({ format });
          const storageKey = `qr/${workspaceId}/${qrCodeId}/${rendered.checksum}.${rendered.extension}`;
          await storage.putObject(storageKey, rendered.body);

          return {
            bytes: rendered.bytes,
            checksum: rendered.checksum,
            format: rendered.format,
            heightPx: rendered.heightPx,
            publicUrl: `http://localhost:4000/api/v1/qr-codes/${qrCodeId}/downloads?format=${format}`,
            storageKey,
            widthPx: rendered.widthPx,
            workspaceId
          };
        })
      );
      assets.splice(0, assets.length, ...renderedAssets);
      return findUniqueOrThrow();
    }
  };

  const service = new QrCodesService(
    prisma as any,
    telemetry as any,
    slugCache as any,
    storage as any,
    assetPipeline as any,
    renderQueue as any,
    analytics as any
  );
  const result = await service.create("user-1", {
    content: { link: "https://example.com/spring" },
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
    title: "Spring campaign",
    type: "link",
    workspaceId
  });

  assert.equal(result.id, qrCodeId);
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.downloads.length, 2);
  assert.match(result.shortUrl, /\/r\/[A-Za-z0-9_-]+$/);

  const download = await service.download("user-1", qrCodeId, "png");
  assert.equal(download.kind, "file");
  assert.equal(download.contentType, "image/png");
  assert.equal(download.body.toString(), "png-body");
});

test("ScanService.resolve asks for a password before redirecting protected QR codes", async () => {
  const passwordHash = await hash("unlock-me", 12);
  const prisma = {
    qRCode: {
      findUnique: async () => ({
        adsEnabled: true,
        archivedAt: null,
        content: {
          createdAt: new Date(),
          payload: {
            link: "https://example.com/protected"
          },
          qrCodeId: "qr-1",
          schemaVersion: 1,
          targetUrl: "https://example.com/protected",
          updatedAt: new Date()
        },
        createdAt: new Date(),
        deletedAt: null,
        expiresAt: null,
        folderId: null,
        id: "qr-1",
        isOneTime: false,
        lastScanAt: null,
        maxScans: null,
        ownerUserId: "user-1",
        passwordHash,
        redirectRules: [],
        scansCount: BigInt(0),
        slug: "secret42",
        status: "ACTIVE",
        title: "Protected QR",
        type: "link",
        updatedAt: new Date(),
        workspaceId: "workspace-1"
      }),
      update: async () => undefined
    }
  };
  const rateLimit = {
    async check() {
      return {
        allowed: true,
        current: 1,
        limit: 120,
        retryAfterSeconds: 60
      };
    }
  };

  const service = new ScanService(
    prisma as any,
    telemetry as any,
    createSlugCache() as any,
    rateLimit as any,
    analytics as any,
    logger as any
  );
  const request = {
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" }
  } as Request;

  const result = await service.resolve("secret42", request);

  assert.equal(result.kind, "password_required");
});
