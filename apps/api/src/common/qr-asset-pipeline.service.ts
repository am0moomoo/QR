import {
  BadRequestException,
  Injectable
} from "@nestjs/common";
import {
  AssetFormat,
  Prisma
} from "@prisma/client";
import type { ExportFormat } from "@qr/types";
import { PrismaService } from "./prisma.service";
import {
  QrRenderService,
  type RenderedQrAsset
} from "./qr-render.service";
import { StorageService } from "./storage.service";
import { StructuredLoggerService } from "./structured-logger.service";

export type QrCodeRecord = Prisma.QRCodeGetPayload<{
  include: {
    assets: true;
    content: true;
    design: true;
    redirectRules: true;
    workspace: true;
  };
}>;

type StoredAssetDraft = {
  bytes: bigint;
  checksum: string;
  format: AssetFormat;
  heightPx: number;
  storageKey: string;
  widthPx: number;
};

@Injectable()
export class QrAssetPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly qrRender: QrRenderService,
    private readonly logger: StructuredLoggerService
  ) {}

  async getQrCodeSnapshot(id: string) {
    return this.prisma.qRCode.findUniqueOrThrow({
      where: { id },
      include: {
        assets: true,
        content: true,
        design: true,
        redirectRules: true,
        workspace: true
      }
    });
  }

  getExistingExportFormats(qrCode: QrCodeRecord): ExportFormat[] {
    const formats = qrCode.assets
      .filter((asset) => asset.kind === "QR_IMAGE")
      .map((asset) => asset.format.toLowerCase() as ExportFormat);

    return formats.length > 0 ? formats : ["png", "svg"];
  }

  getSupportedExportFormats(requestedFormats: ExportFormat[]): ExportFormat[] {
    const uniqueFormats = [...new Set(requestedFormats)] as ExportFormat[];

    if (uniqueFormats.some((format) => format !== "png" && format !== "svg")) {
      throw new BadRequestException(
        "Only png and svg exports are implemented in this build."
      );
    }

    return uniqueFormats.length > 0
      ? uniqueFormats
      : (["png", "svg"] as ExportFormat[]);
  }

  async renderAndSync(qrCodeId: string, requestedFormats: ExportFormat[]) {
    const qrCode = await this.getQrCodeSnapshot(qrCodeId);
    const formats = this.getSupportedExportFormats(requestedFormats);
    const oldStorageKeys = qrCode.assets
      .filter((asset) => asset.kind === "QR_IMAGE")
      .map((asset) => asset.storageKey);
    const uploadedStorageKeys: string[] = [];
    const renderedAssets: StoredAssetDraft[] = [];

    try {
      for (const format of formats) {
        const renderedAsset = await this.qrRender.render({
          design: this.toRenderDesign(qrCode.design),
          format,
          shortUrl: this.buildShortUrl(qrCode.slug),
          slug: qrCode.slug
        });
        const storageKey = this.buildStorageKey(qrCode, renderedAsset);
        await this.storage.putObject(storageKey, renderedAsset.body);
        uploadedStorageKeys.push(storageKey);
        renderedAssets.push({
          bytes: renderedAsset.bytes,
          checksum: renderedAsset.checksum,
          format: renderedAsset.format,
          heightPx: renderedAsset.heightPx,
          storageKey,
          widthPx: renderedAsset.widthPx
        });
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.qRAsset.deleteMany({
          where: {
            kind: "QR_IMAGE",
            qrCodeId
          }
        });

        if (renderedAssets.length > 0) {
          await tx.qRAsset.createMany({
            data: renderedAssets.map((asset) => ({
              bytes: asset.bytes,
              checksum: asset.checksum,
              format: asset.format,
              heightPx: asset.heightPx,
              kind: "QR_IMAGE",
              publicUrl: this.buildDownloadUrl(
                qrCode.id,
                asset.format.toLowerCase()
              ),
              qrCodeId: qrCode.id,
              storageKey: asset.storageKey,
              widthPx: asset.widthPx,
              workspaceId: qrCode.workspaceId
            }))
          });
        }
      });
    } catch (error) {
      await this.storage.deleteObjects(uploadedStorageKeys);
      this.logger.error(
        "qr.render_sync_failed",
        error,
        {
          formats,
          qrCodeId
        },
        QrAssetPipelineService.name
      );
      throw error;
    }

    await this.storage.deleteObjects(
      oldStorageKeys.filter(
        (storageKey) => !uploadedStorageKeys.includes(storageKey)
      )
    );

    return this.getQrCodeSnapshot(qrCode.id);
  }

  async waitForFormats(
    qrCodeId: string,
    requestedFormats: ExportFormat[],
    timeoutMs = 15_000
  ) {
    const formats = this.getSupportedExportFormats(requestedFormats);
    const expectedFormats = new Set(
      formats.map((format) =>
        format === "png" ? AssetFormat.PNG : AssetFormat.SVG
      )
    );
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const qrCode = await this.getQrCodeSnapshot(qrCodeId);
      const availableFormats = new Set(
        qrCode.assets
          .filter((asset) => asset.kind === "QR_IMAGE")
          .map((asset) => asset.format)
      );

      if (
        [...expectedFormats].every((format) => availableFormats.has(format))
      ) {
        return qrCode;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(
      `Timed out waiting for rendered assets for QR ${qrCodeId}.`
    );
  }

  private buildStorageKey(qrCode: QrCodeRecord, renderedAsset: RenderedQrAsset) {
    return `qr/${qrCode.workspaceId}/${qrCode.id}/${renderedAsset.checksum}.${renderedAsset.extension}`;
  }

  private buildShortUrl(slug: string) {
    const baseUrl = (
      process.env.SHORT_DOMAIN ??
      process.env.API_URL ??
      "http://localhost:4000"
    ).replace(/\/$/, "");
    return `${baseUrl}/r/${slug}`;
  }

  private buildDownloadUrl(qrCodeId: string, format: string) {
    const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(
      /\/$/,
      ""
    );
    return `${apiUrl}/api/v1/qr-codes/${qrCodeId}/downloads?format=${format}`;
  }

  private toRenderDesign(qrDesign: QrCodeRecord["design"]) {
    if (!qrDesign) {
      return null;
    }

    return {
      backgroundColor: qrDesign.backgroundColor,
      cornersInner: qrDesign.cornersInner,
      cornersInnerColor: qrDesign.cornersInnerColor,
      cornersOuter: qrDesign.cornersOuter,
      cornersOuterColor: qrDesign.cornersOuterColor,
      errorCorrection: qrDesign.errorCorrection as "L" | "M" | "Q" | "H",
      logoAssetId: qrDesign.logoAssetId,
      logoHideBg: qrDesign.logoHideBg,
      pattern: qrDesign.pattern,
      patternColor: qrDesign.patternColor,
      quietZoneModules: qrDesign.quietZoneModules,
      sizePx: qrDesign.sizePx
    };
  }
}
