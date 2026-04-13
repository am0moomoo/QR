import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AssetFormat } from "@prisma/client";
import * as QRCode from "qrcode";
import { type ExportFormat, type QrDesignInput } from "@qr/types";

type RenderAssetInput = {
  design: Partial<QrDesignInput> | null | undefined;
  format: ExportFormat;
  shortUrl: string;
  slug: string;
};

export type RenderedQrAsset = {
  body: Buffer;
  bytes: bigint;
  checksum: string;
  contentType: string;
  extension: ExportFormat;
  fileName: string;
  format: AssetFormat;
  heightPx: number;
  widthPx: number;
};

@Injectable()
export class QrRenderService {
  async render(input: RenderAssetInput): Promise<RenderedQrAsset> {
    if (input.format !== "png" && input.format !== "svg") {
      throw new BadRequestException(
        `Unsupported export format "${input.format}". Only png and svg are implemented right now.`
      );
    }

    const sizePx = input.design?.sizePx ?? 512;
    const errorCorrectionLevel = input.design?.errorCorrection ?? "M";
    const margin = input.design?.quietZoneModules ?? 4;
    const dark = input.design?.patternColor ?? "#111111";
    const light = input.design?.backgroundColor ?? "#ffffff";

    const qrOptions = {
      color: {
        dark,
        light
      },
      errorCorrectionLevel,
      margin,
      width: sizePx
    } as const;

    const body =
      input.format === "png"
        ? await QRCode.toBuffer(input.shortUrl, {
            ...qrOptions,
            type: "png"
          })
        : Buffer.from(
            await QRCode.toString(input.shortUrl, {
              ...qrOptions,
              type: "svg"
            }),
            "utf8"
          );

    return {
      body,
      bytes: BigInt(body.byteLength),
      checksum: createHash("sha256").update(body).digest("hex"),
      contentType: input.format === "png" ? "image/png" : "image/svg+xml",
      extension: input.format,
      fileName: `${input.slug}.${input.format}`,
      format: input.format === "png" ? AssetFormat.PNG : AssetFormat.SVG,
      heightPx: sizePx,
      widthPx: sizePx
    };
  }
}
