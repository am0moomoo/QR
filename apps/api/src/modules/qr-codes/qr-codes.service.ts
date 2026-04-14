import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  AssetFormat,
  Prisma,
  QRCodeStatus
} from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import {
  type ExportFormat,
  type QrType,
  createQrCodeSchema,
  getQrContentSchema,
  getQrTargetUrl,
  qrDesignSchema,
  qrSettingsSchema,
  updateQrCodeSchema,
} from "@qr/types";
import { z } from "zod";
import { AnalyticsService } from "../../common/analytics.service";
import { PrismaService } from "../../common/prisma.service";
import {
  QrAssetPipelineService,
  type QrCodeRecord
} from "../../common/qr-asset-pipeline.service";
import { RenderQueueService } from "../../common/render-queue.service";
import { SlugCacheService } from "../../common/slug-cache.service";
import { StorageService } from "../../common/storage.service";
import { StructuredLoggerService } from "../../common/structured-logger.service";
import { TelemetryService } from "../../common/telemetry.service";
import { assertSafeRedirectTarget } from "../../common/url-safety";
import {
  getPreferredCustomDomain,
  getWorkspaceBrandingVersion,
  getWorkspaceShortBaseUrl
} from "../../common/workspace-branding.util";
import { parseWithSchema } from "../../common/zod.util";
import { BillingService } from "../billing/billing.service";

const listQrCodesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(QRCodeStatus).optional(),
  type: z.string().optional(),
  workspaceId: z.string().uuid().optional()
});

const qrAnalyticsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

const qrCodeRecordInclude = {
  assets: true,
  content: true,
  design: true,
  folder: true,
  redirectRules: true,
  workspace: {
    include: {
      customDomains: true
    }
  }
} satisfies Prisma.QRCodeInclude;

type DownloadFileResponse = {
  kind: "file";
  body: Buffer;
  contentLength: bigint;
  contentType: string;
  fileName: string;
};

type DownloadRedirectResponse = {
  kind: "redirect";
  contentType: string;
  fileName: string;
  redirectUrl: string;
};

type DownloadResponse = DownloadFileResponse | DownloadRedirectResponse;

class DownloadAssetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadAssetValidationError";
  }
}

@Injectable()
export class QrCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
    private readonly slugCache: SlugCacheService<QrCodeRecord>,
    private readonly storage: StorageService,
    private readonly assetPipeline: QrAssetPipelineService,
    private readonly renderQueue: RenderQueueService,
    private readonly analytics: AnalyticsService,
    private readonly logger: StructuredLoggerService,
    private readonly billing: BillingService
  ) {}

  async list(userId: string, query: unknown) {
    const input = parseWithSchema(listQrCodesQuerySchema, query);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.QRCodeWhereInput = {
      deletedAt: null,
      ownerUserId: userId
    };

    if (input.status) {
      where.status = input.status;
    }

    if (input.type) {
      where.type = input.type;
    }

    if (input.workspaceId) {
      where.workspaceId = input.workspaceId;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.qRCode.findMany({
        where,
        include: qrCodeRecordInclude,
        orderBy: {
          updatedAt: "desc"
        },
        skip,
        take: pageSize
      }),
      this.prisma.qRCode.count({ where })
    ]);

    return {
      items: items.map((item) => this.toQrResponse(item)),
      page,
      pageSize,
      total
    };
  }

  async create(userId: string, payload: unknown) {
    try {
      const input = parseWithSchema(createQrCodeSchema, payload);
      const design = qrDesignSchema.parse(input.design ?? {});
      const settings = qrSettingsSchema.parse(input.settings ?? {});
      const workspace = await this.requireWorkspaceAccess(input.workspaceId, userId);
      await this.billing.enforceQrCreateAllowed(workspace.id);
      const effectiveSettings = await this.billing.applyQrSettingsForPlan(
        workspace.id,
        settings
      );
      const content = parseWithSchema(
        getQrContentSchema(input.type) as z.ZodTypeAny,
        input.content
      );
      const targetUrl = getQrTargetUrl(input.type, content);
      assertSafeRedirectTarget(targetUrl, "QR destination");
      const slug = await this.generateUniqueSlug();
      const passwordHash = effectiveSettings.password
        ? await hash(effectiveSettings.password, 12)
        : null;

      if (input.folderId) {
        await this.requireFolderAccess(input.folderId, input.workspaceId, userId);
      }

      const qrCode = await this.prisma.$transaction(async (tx) => {
        const created = await tx.qRCode.create({
          data: {
            adsEnabled: effectiveSettings.adsEnabled,
            doNotIndex: effectiveSettings.doNotIndex,
            expiresAt: effectiveSettings.expiresAt
              ? new Date(effectiveSettings.expiresAt)
              : null,
            folderId: input.folderId,
            isOneTime: effectiveSettings.isOneTime,
            maxScans: effectiveSettings.maxScans,
            ownerUserId: userId,
            passwordHash,
            slug,
            title: input.title,
            type: input.type,
            workspaceId: workspace.id
          }
        });

        await tx.qRContent.create({
          data: {
            payload: content as Prisma.InputJsonValue,
            qrCodeId: created.id,
            targetUrl
          }
        });

        await tx.qRDesign.create({
          data: {
            backgroundColor: design.backgroundColor,
            cornersInner: design.cornersInner,
            cornersInnerColor: design.cornersInnerColor,
            cornersOuter: design.cornersOuter,
            cornersOuterColor: design.cornersOuterColor,
            errorCorrection: design.errorCorrection,
            logoAssetId: design.logoAssetId,
            logoHideBg: design.logoHideBg,
            pattern: design.pattern,
            patternColor: design.patternColor,
            qrCodeId: created.id,
            quietZoneModules: design.quietZoneModules,
            sizePx: design.sizePx
          }
        });

        return tx.qRCode.findUniqueOrThrow({
          where: { id: created.id },
          include: qrCodeRecordInclude
        });
      });

      const createdQr = await this.renderQueue.render(
        qrCode.id,
        input.exports ?? ["png", "svg"],
        this.buildRenderVersionToken(qrCode)
      );
      try {
        await this.billing.enforceStorageQuota(createdQr.workspaceId);
      } catch (error) {
        await this.remove(userId, createdQr.id);
        throw error;
      }

      await this.slugCache.set(createdQr.slug, createdQr);
      this.telemetry.track("qr.created", {
        qrCodeId: createdQr.id,
        type: createdQr.type,
        userId,
        workspaceId: createdQr.workspaceId
      });
      this.logger.info(
        "qr.created",
        {
          qrCodeId: createdQr.id,
          type: createdQr.type,
          userId,
          workspaceId: createdQr.workspaceId
        },
        QrCodesService.name
      );

      return this.toCreateQrResponse(createdQr);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        throw error;
      }

      this.logger.error(
        "qr.create_failed",
        error,
        {
          userId
        },
        QrCodesService.name
      );
      throw error;
    }
  }

  async getOne(userId: string, id: string) {
    const qrCode = await this.requireQrCodeAccess(id, userId);
    return this.toQrResponse(qrCode);
  }

  async update(userId: string, id: string, payload: unknown) {
    const input = parseWithSchema(updateQrCodeSchema, payload);
    const existingQr = await this.requireQrCodeAccess(id, userId);
    const nextContent = input.content
      ? parseWithSchema(
          getQrContentSchema(existingQr.type as QrType) as z.ZodTypeAny,
          input.content
        )
      : (existingQr.content?.payload as Prisma.JsonObject | null);
    const nextTargetUrl = nextContent
      ? getQrTargetUrl(existingQr.type as QrType, nextContent)
      : existingQr.content?.targetUrl ?? null;
    assertSafeRedirectTarget(nextTargetUrl, "QR destination");
    const nextDesign = input.design
      ? qrDesignSchema.parse(input.design)
      : existingQr.design;
    const designChanged = Boolean(input.design);
    const nextSettings = input.settings
      ? await this.billing.applyQrSettingsForPlan(existingQr.workspaceId, {
          adsEnabled: input.settings.adsEnabled ?? existingQr.adsEnabled,
          doNotIndex: input.settings.doNotIndex ?? existingQr.doNotIndex,
          expiresAt:
            input.settings.expiresAt !== undefined
              ? input.settings.expiresAt
              : existingQr.expiresAt?.toISOString() ?? null,
          isOneTime: input.settings.isOneTime ?? existingQr.isOneTime,
          maxScans:
            input.settings.maxScans !== undefined
              ? input.settings.maxScans
              : existingQr.maxScans,
          password:
            "password" in input.settings
              ? input.settings.password ?? null
              : null
        })
      : null;
    const passwordHash =
      nextSettings && input.settings && "password" in input.settings
        ? nextSettings.password
          ? await hash(nextSettings.password, 12)
          : null
        : existingQr.passwordHash;

    const updatedQr = await this.prisma.$transaction(async (tx) => {
        await tx.qRCode.update({
          where: { id },
          data: {
            adsEnabled: nextSettings?.adsEnabled ?? existingQr.adsEnabled,
            doNotIndex: nextSettings?.doNotIndex ?? existingQr.doNotIndex,
            expiresAt:
              nextSettings?.expiresAt !== undefined
                ? nextSettings.expiresAt
                  ? new Date(nextSettings.expiresAt)
                  : null
                : existingQr.expiresAt,
            folderId:
              input.folderId !== undefined ? input.folderId : existingQr.folderId,
            isOneTime: nextSettings?.isOneTime ?? existingQr.isOneTime,
            maxScans:
              nextSettings?.maxScans !== undefined
                ? nextSettings.maxScans
                : existingQr.maxScans,
            passwordHash,
          title: input.title !== undefined ? input.title : existingQr.title
        }
      });

      if (nextContent) {
        await tx.qRContent.upsert({
          where: { qrCodeId: id },
          update: {
            payload: nextContent as Prisma.InputJsonValue,
            targetUrl: nextTargetUrl
          },
          create: {
            payload: nextContent as Prisma.InputJsonValue,
            qrCodeId: id,
            targetUrl: nextTargetUrl
          }
        });
      }

      if (nextDesign) {
        await tx.qRDesign.upsert({
          where: { qrCodeId: id },
          update: {
            backgroundColor: nextDesign.backgroundColor,
            cornersInner: nextDesign.cornersInner,
            cornersInnerColor: nextDesign.cornersInnerColor,
            cornersOuter: nextDesign.cornersOuter,
            cornersOuterColor: nextDesign.cornersOuterColor,
            errorCorrection: nextDesign.errorCorrection,
            logoAssetId: nextDesign.logoAssetId,
            logoHideBg: nextDesign.logoHideBg,
            pattern: nextDesign.pattern,
            patternColor: nextDesign.patternColor,
            quietZoneModules: nextDesign.quietZoneModules,
            sizePx: nextDesign.sizePx
          },
          create: {
            backgroundColor: nextDesign.backgroundColor,
            cornersInner: nextDesign.cornersInner,
            cornersInnerColor: nextDesign.cornersInnerColor,
            cornersOuter: nextDesign.cornersOuter,
            cornersOuterColor: nextDesign.cornersOuterColor,
            errorCorrection: nextDesign.errorCorrection,
            logoAssetId: nextDesign.logoAssetId,
            logoHideBg: nextDesign.logoHideBg,
            pattern: nextDesign.pattern,
            patternColor: nextDesign.patternColor,
            qrCodeId: id,
            quietZoneModules: nextDesign.quietZoneModules,
            sizePx: nextDesign.sizePx
          }
        });
      }

      return tx.qRCode.findUniqueOrThrow({
        where: { id },
        include: qrCodeRecordInclude
      });
    });

    const finalQr =
      designChanged || this.assetPipeline.getExistingExportFormats(updatedQr).length === 0
        ? await this.renderQueue.render(
            updatedQr.id,
            this.assetPipeline.getExistingExportFormats(existingQr),
            this.buildRenderVersionToken(updatedQr)
          )
        : updatedQr;

    await this.slugCache.set(finalQr.slug, finalQr);
    this.telemetry.track("qr.updated", {
      qrCodeId: finalQr.id,
      userId
    });
    this.logger.info(
      "qr.updated",
      {
        qrCodeId: finalQr.id,
        userId
      },
      QrCodesService.name
    );

    return this.toQrResponse(finalQr);
  }

  async remove(userId: string, id: string) {
    const qrCode = await this.requireQrCodeAccess(id, userId);

    await this.prisma.qRCode.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: "DELETED"
      }
    });

    await this.slugCache.delete(qrCode.slug);
    await this.storage.deleteObjects(
      qrCode.assets
        .filter((asset) => asset.kind === "QR_IMAGE")
        .map((asset) => asset.storageKey)
    );

    this.telemetry.track("qr.deleted", {
      qrCodeId: id,
      userId
    });
    this.logger.info(
      "qr.deleted",
      {
        qrCodeId: id,
        userId
      },
      QrCodesService.name
    );

    return {
      success: true
    };
  }

  async listDownloads(userId: string, id: string) {
    const qrCode = await this.requireQrCodeAccess(id, userId);
    return {
      downloads: this.toDownloadItems(qrCode)
    };
  }

  async download(userId: string, id: string, format: string): Promise<DownloadResponse> {
    const qrCode = await this.requireQrCodeAccess(id, userId);
    const normalizedFormat = this.normalizeDownloadFormat(format);
    let asset = qrCode.assets.find(
      (currentAsset) =>
        currentAsset.kind === "QR_IMAGE" &&
        currentAsset.format === this.toAssetFormat(normalizedFormat)
    );

    if (!asset) {
      const refreshed = await this.renderQueue.render(qrCode.id, [
          ...new Set([
          ...this.assetPipeline.getExistingExportFormats(qrCode),
          normalizedFormat
        ])
      ] as ExportFormat[], this.buildRenderVersionToken(qrCode));
      asset = refreshed.assets.find(
        (currentAsset) =>
          currentAsset.kind === "QR_IMAGE" &&
          currentAsset.format === this.toAssetFormat(normalizedFormat)
      );
    }

    if (!asset) {
      throw new NotFoundException("QR download was not generated");
    }

    this.logger.info(
      "qr.download_requested",
      {
        format: normalizedFormat,
        qrCodeId: qrCode.id,
        userId
      },
      QrCodesService.name
    );

    const signedDownloadUrl = await this.storage.getSignedDownloadUrl(
      asset.storageKey,
      this.getSignedUrlTtlSeconds()
    );

    if (signedDownloadUrl) {
      return {
        contentType: this.getContentTypeForAssetFormat(asset.format),
        fileName: `${qrCode.slug}.${normalizedFormat}`,
        kind: "redirect",
        redirectUrl: signedDownloadUrl
      };
    }

    const storedObject = await this.loadDownloadObject(qrCode, asset, normalizedFormat);

    return {
      body: storedObject.body,
      contentLength: storedObject.bytes,
      contentType: this.getContentTypeForAssetFormat(asset.format),
      fileName: `${qrCode.slug}.${normalizedFormat}`,
      kind: "file"
    };
  }

  async render(userId: string, id: string) {
    const qrCode = await this.requireQrCodeAccess(id, userId);
    let refreshed: QrCodeRecord;

    try {
      refreshed = await this.renderQueue.render(
        qrCode.id,
        this.assetPipeline.getExistingExportFormats(qrCode),
        this.buildRenderVersionToken(qrCode)
      );
    } catch (error) {
      this.logger.error(
        "qr.render_failed",
        error,
        {
          qrCodeId: id,
          userId
        },
        QrCodesService.name
      );
      throw new ServiceUnavailableException(
        "QR assets could not be regenerated right now. Please try again in a moment."
      );
    }

    this.telemetry.track("qr.render_requested", {
      qrCodeId: id,
      userId
    });
    this.logger.info(
      "qr.render_requested",
      {
        qrCodeId: id,
        userId
      },
      QrCodesService.name
    );

    return {
      accepted: true,
      downloads: this.toDownloadItems(refreshed)
    };
  }

  async changeStatus(userId: string, id: string, status: QRCodeStatus) {
    const qrCode = await this.requireQrCodeAccess(id, userId);
    const updated = await this.prisma.qRCode.update({
      where: { id },
      data: {
        archivedAt: status === "ARCHIVED" ? new Date() : null,
        status
      },
      include: qrCodeRecordInclude
    });

    if (status === "ACTIVE") {
      await this.slugCache.set(qrCode.slug, updated);
    } else {
      await this.slugCache.delete(qrCode.slug);
    }

    this.telemetry.track("qr.status_changed", {
      qrCodeId: id,
      status,
      userId
    });

    return this.toQrResponse(updated);
  }

  async duplicate(userId: string, id: string) {
    const qrCode = await this.requireQrCodeAccess(id, userId);
    await this.billing.enforceQrCreateAllowed(qrCode.workspaceId);
    const slug = await this.generateUniqueSlug();

    const duplicated = await this.prisma.$transaction(async (tx) => {
      const created = await tx.qRCode.create({
        data: {
          adsEnabled: qrCode.adsEnabled,
          doNotIndex: qrCode.doNotIndex,
          expiresAt: qrCode.expiresAt,
          folderId: qrCode.folderId,
          isOneTime: qrCode.isOneTime,
          maxScans: qrCode.maxScans,
          ownerUserId: qrCode.ownerUserId,
          passwordHash: qrCode.passwordHash,
          slug,
          title: qrCode.title ? `${qrCode.title} copy` : "Untitled copy",
          type: qrCode.type,
          workspaceId: qrCode.workspaceId
        }
      });

      if (qrCode.content) {
        await tx.qRContent.create({
          data: {
            payload: this.toInputJson(qrCode.content.payload),
            qrCodeId: created.id,
            targetUrl: qrCode.content.targetUrl
          }
        });
      }

      if (qrCode.design) {
        await tx.qRDesign.create({
          data: {
            backgroundColor: qrCode.design.backgroundColor,
            cornersInner: qrCode.design.cornersInner,
            cornersInnerColor: qrCode.design.cornersInnerColor,
            cornersOuter: qrCode.design.cornersOuter,
            cornersOuterColor: qrCode.design.cornersOuterColor,
            errorCorrection: qrCode.design.errorCorrection,
            logoAssetId: qrCode.design.logoAssetId,
            logoHideBg: qrCode.design.logoHideBg,
            pattern: qrCode.design.pattern,
            patternColor: qrCode.design.patternColor,
            qrCodeId: created.id,
            quietZoneModules: qrCode.design.quietZoneModules,
            sizePx: qrCode.design.sizePx
          }
        });
      }

      return tx.qRCode.findUniqueOrThrow({
        where: { id: created.id },
        include: qrCodeRecordInclude
      });
    });

    const duplicatedQr = await this.renderQueue.render(
      duplicated.id,
      this.assetPipeline.getExistingExportFormats(qrCode),
      this.buildRenderVersionToken(duplicated)
    );
    try {
      await this.billing.enforceStorageQuota(duplicatedQr.workspaceId);
    } catch (error) {
      await this.remove(userId, duplicatedQr.id);
      throw error;
    }

    await this.slugCache.set(duplicatedQr.slug, duplicatedQr);
    this.telemetry.track("qr.duplicated", {
      fromQrCodeId: id,
      qrCodeId: duplicatedQr.id,
      userId
    });
    this.logger.info(
      "qr.duplicated",
      {
        fromQrCodeId: id,
        qrCodeId: duplicatedQr.id,
        userId
      },
      QrCodesService.name
    );

    return this.toCreateQrResponse(duplicatedQr);
  }

  async getAnalytics(userId: string, id: string, query: unknown) {
    await this.requireQrCodeAccess(id, userId);
    const input = parseWithSchema(qrAnalyticsQuerySchema, query);
    return this.analytics.getQrAnalytics(id, input);
  }

  async requireQrCodeAccess(id: string, userId: string) {
    const qrCode = await this.prisma.qRCode.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [
          { ownerUserId: userId },
          {
            workspace: {
              members: {
                some: {
                  userId
                }
              }
            }
          }
        ]
      },
      include: qrCodeRecordInclude
    });

    if (!qrCode) {
      throw new NotFoundException("QR code not found");
    }

    return qrCode;
  }

  private async requireWorkspaceAccess(workspaceId: string, userId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerUserId: userId },
          {
            members: {
              some: {
                userId
              }
            }
          }
        ]
      }
    });

    if (!workspace) {
      throw new ForbiddenException("Workspace is not accessible");
    }

    return workspace;
  }

  private async requireFolderAccess(
    folderId: string,
    workspaceId: string,
    userId: string
  ) {
    const folder = await this.prisma.folder.findFirst({
      where: {
        id: folderId,
        workspaceId,
        OR: [
          { ownerUserId: userId },
          {
            workspace: {
              members: {
                some: {
                  userId
                }
              }
            }
          }
        ]
      }
    });

    if (!folder) {
      throw new ForbiddenException("Folder is not accessible");
    }

    return folder;
  }

  private toCreateQrResponse(qrCode: QrCodeRecord) {
    return {
      customDomain: getPreferredCustomDomain(qrCode.workspace)?.domain ?? null,
      downloads: this.toDownloadItems(qrCode),
      id: qrCode.id,
      shortUrl: this.buildShortUrl(qrCode),
      slug: qrCode.slug,
      status: qrCode.status
    };
  }

  private toQrResponse(qrCode: QrCodeRecord) {
    return {
      adsEnabled: qrCode.adsEnabled,
      content: qrCode.content?.payload ?? null,
      createdAt: qrCode.createdAt.toISOString(),
      customDomain: getPreferredCustomDomain(qrCode.workspace)?.domain ?? null,
      design: qrCode.design,
      doNotIndex: qrCode.doNotIndex,
      downloads: this.toDownloadItems(qrCode),
      expiresAt: qrCode.expiresAt?.toISOString() ?? null,
      folderId: qrCode.folderId,
      folder: qrCode.folder
        ? {
            id: qrCode.folder.id,
            name: qrCode.folder.name,
            parentId: qrCode.folder.parentId
          }
        : null,
      id: qrCode.id,
      isOneTime: qrCode.isOneTime,
      lastScanAt: qrCode.lastScanAt?.toISOString() ?? null,
      maxScans: qrCode.maxScans,
      scansCount: qrCode.scansCount.toString(),
      shortUrl: this.buildShortUrl(qrCode),
      slug: qrCode.slug,
      status: qrCode.status,
      title: qrCode.title,
      type: qrCode.type,
      updatedAt: qrCode.updatedAt.toISOString(),
      workspace: {
        id: qrCode.workspace.id,
        name: qrCode.workspace.name,
        plan: qrCode.workspace.plan.toLowerCase(),
        slug: qrCode.workspace.slug
      },
      workspaceId: qrCode.workspaceId
    };
  }

  private toDownloadItems(qrCode: QrCodeRecord) {
    return qrCode.assets
      .filter((asset) => asset.kind === "QR_IMAGE")
      .map((asset) => ({
        bytes: asset.bytes?.toString() ?? null,
        checksum: asset.checksum,
        format: asset.format.toLowerCase(),
        url:
          asset.publicUrl ??
          this.buildDownloadUrl(qrCode.id, asset.format.toLowerCase())
      }));
  }

  private async loadDownloadObject(
    qrCode: QrCodeRecord,
    asset: QrCodeRecord["assets"][number],
    format: ExportFormat
  ) {
    try {
      const storedObject = await this.storage.getObject(asset.storageKey);
      this.assertDownloadBodyMatchesFormat(asset.format, storedObject.body);
      return storedObject;
    } catch (error) {
      if (!this.isRecoverableDownloadError(error)) {
        throw error;
      }

      this.logger.warn(
        "qr.download_asset_repair_started",
        {
          format,
          qrCodeId: qrCode.id,
          reason: error instanceof Error ? error.message : String(error),
          storageKey: asset.storageKey
        },
        QrCodesService.name
      );

      const repairedAsset = await this.repairDownloadAsset(qrCode, format);

      try {
        const repairedObject = await this.storage.getObject(repairedAsset.storageKey);
        this.assertDownloadBodyMatchesFormat(repairedAsset.format, repairedObject.body);
        return repairedObject;
      } catch (repairError) {
        this.logger.error(
          "qr.download_asset_repair_fetch_failed",
          repairError,
          {
            format,
            qrCodeId: qrCode.id,
            storageKey: repairedAsset.storageKey
          },
          QrCodesService.name
        );
        throw new ServiceUnavailableException(
          "QR asset is temporarily unavailable. Please try again in a moment."
        );
      }
    }
  }

  private async repairDownloadAsset(
    qrCode: QrCodeRecord,
    format: ExportFormat
  ) {
    try {
      const refreshed = await this.renderQueue.render(
        qrCode.id,
        [
          ...new Set([
            ...this.assetPipeline.getExistingExportFormats(qrCode),
            format
          ])
        ] as ExportFormat[],
        this.buildRenderVersionToken(qrCode)
      );
      const repairedAsset = refreshed.assets.find(
        (currentAsset) =>
          currentAsset.kind === "QR_IMAGE" &&
          currentAsset.format === this.toAssetFormat(format)
      );

      if (!repairedAsset) {
        throw new ServiceUnavailableException(
          "QR assets could not be repaired right now. Please try again in a moment."
        );
      }

      return repairedAsset;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.error(
        "qr.download_asset_repair_failed",
        error,
        {
          format,
          qrCodeId: qrCode.id
        },
        QrCodesService.name
      );
      throw new ServiceUnavailableException(
        "QR asset is temporarily unavailable. Please try again in a moment."
      );
    }
  }

  private assertDownloadBodyMatchesFormat(format: AssetFormat, body: Buffer) {
    if (format === AssetFormat.PNG) {
      const pngSignature = "89504e470d0a1a0a";

      if (body.subarray(0, 8).toString("hex") !== pngSignature) {
        throw new DownloadAssetValidationError(
          "Stored PNG asset contents do not match the expected file format."
        );
      }

      return;
    }

    const normalized = body.toString("utf8", 0, Math.min(body.length, 512)).trimStart();

    if (!normalized.startsWith("<svg") && !normalized.startsWith("<?xml")) {
      throw new DownloadAssetValidationError(
        "Stored SVG asset contents do not match the expected file format."
      );
    }
  }

  private isRecoverableDownloadError(error: unknown) {
    return (
      error instanceof NotFoundException ||
      error instanceof DownloadAssetValidationError
    );
  }

  private buildShortUrl(qrCode: Pick<QrCodeRecord, "slug" | "workspace">) {
    return `${getWorkspaceShortBaseUrl(qrCode.workspace)}/r/${qrCode.slug}`;
  }

  private buildRenderVersionToken(
    qrCode: Pick<QrCodeRecord, "updatedAt" | "workspace">
  ) {
    return `${qrCode.updatedAt.toISOString()}:${getWorkspaceBrandingVersion(qrCode.workspace)}`;
  }

  private buildDownloadUrl(qrCodeId: string, format: string) {
    const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(
      /\/$/,
      ""
    );
    return `${apiUrl}/api/v1/qr-codes/${qrCodeId}/downloads?format=${format}`;
  }

  private normalizeDownloadFormat(format: string) {
    const normalizedFormat = format.trim().toLowerCase();

    if (normalizedFormat !== "png" && normalizedFormat !== "svg") {
      throw new BadRequestException("Only png and svg downloads are supported.");
    }

    return normalizedFormat as ExportFormat;
  }

  private toAssetFormat(format: ExportFormat) {
    return format === "png" ? AssetFormat.PNG : AssetFormat.SVG;
  }

  private getContentTypeForAssetFormat(format: AssetFormat) {
    return format === AssetFormat.PNG ? "image/png" : "image/svg+xml";
  }

  private getSignedUrlTtlSeconds() {
    const rawValue = Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS ?? "300");
    return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 300;
  }

  private toInputJson(value: Prisma.JsonValue) {
    return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }

  private async generateUniqueSlug() {
    let slug = "";

    do {
      slug = randomBytes(4)
        .toString("base64url")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 8);
    } while (
      !slug ||
      (await this.prisma.qRCode.findUnique({
        where: { slug }
      }))
    );

    return slug;
  }
}
