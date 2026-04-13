import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { Prisma, ScanOutcome } from "@prisma/client";
import { compare } from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { type QrType, getQrTargetUrl } from "@qr/types";
import type { Request } from "express";
import { PrismaService } from "../../common/prisma.service";
import { ScanEventQueueService } from "../../common/scan-event-queue.service";
import { ScanRateLimitService } from "../../common/scan-rate-limit.service";
import { SlugCacheService } from "../../common/slug-cache.service";
import { StructuredLoggerService } from "../../common/structured-logger.service";
import { TelemetryService } from "../../common/telemetry.service";

type ScanRecord = Prisma.QRCodeGetPayload<{
  include: {
    content: true;
    redirectRules: true;
  };
}>;

type ScanResult =
  | {
      destination: string;
      kind: "redirect";
    }
  | {
      content: Prisma.JsonValue | null;
      kind: "landing";
      slug: string;
      title: string | null;
      type: string;
    }
  | {
      kind: "inactive";
      slug: string;
    }
  | {
      kind: "password_required";
      slug: string;
    }
  | {
      kind: "rate_limited";
      retryAfterSeconds: number;
      slug: string;
    };

@Injectable()
export class ScanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
    private readonly slugCache: SlugCacheService<ScanRecord>,
    private readonly scanRateLimit: ScanRateLimitService,
    private readonly scanEvents: ScanEventQueueService,
    private readonly logger: StructuredLoggerService
  ) {}

  async resolve(slug: string, request: Request, password?: string): Promise<ScanResult> {
    const qrCode = await this.loadQrCode(slug);

    if (!qrCode) {
      this.telemetry.track("scan.not_found", { slug });
      throw new NotFoundException("QR code not found");
    }

    const metadata = this.extractRequestMetadata(request);
    const rateLimit = await this.scanRateLimit.check(
      metadata.ipAddress ?? "anonymous",
      slug
    );

    if (!rateLimit.allowed) {
      await this.recordOutcome(qrCode, metadata, "BLOCKED");
      return {
        kind: "rate_limited",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
        slug
      };
    }

    if (
      qrCode.status !== "ACTIVE" ||
      qrCode.deletedAt ||
      (qrCode.expiresAt && qrCode.expiresAt < new Date()) ||
      (qrCode.maxScans !== null && Number(qrCode.scansCount) >= qrCode.maxScans)
    ) {
      await this.recordOutcome(
        qrCode,
        metadata,
        qrCode.expiresAt && qrCode.expiresAt < new Date() ? "EXPIRED" : "INACTIVE"
      );
      await this.slugCache.delete(slug);
      return {
        kind: "inactive",
        slug
      };
    }

    if (qrCode.passwordHash) {
      if (!password) {
        await this.recordOutcome(qrCode, metadata, "PASSWORD_REQUIRED");
        return {
          kind: "password_required",
          slug
        };
      }

      const passwordMatches = await compare(password, qrCode.passwordHash);

      if (!passwordMatches) {
        throw new UnauthorizedException("Invalid password");
      }
    }

    const matchedRule = this.findMatchingRule(qrCode, request);
    const fallbackTarget =
      qrCode.content?.targetUrl ??
      getQrTargetUrl(qrCode.type as QrType, qrCode.content?.payload ?? {});
    const destination = matchedRule?.targetUrl ?? fallbackTarget;

    await this.touchSuccessfulScan(qrCode);
    await this.recordOutcome(
      qrCode,
      metadata,
      destination ? "REDIRECTED" : "LANDED",
      matchedRule?.id
    );

    if (destination) {
      return {
        destination,
        kind: "redirect"
      };
    }

    return {
      content: qrCode.content?.payload ?? null,
      kind: "landing",
      slug,
      title: qrCode.title,
      type: qrCode.type
    };
  }

  async renderLandingPage(slug: string, request: Request) {
    const result = await this.resolve(slug, request);

    if (result.kind === "landing") {
      return result;
    }

    if (result.kind === "inactive") {
      return result;
    }

    if (result.kind === "password_required") {
      return result;
    }

    if (result.kind === "rate_limited") {
      return result;
    }

    return {
      content: {
        redirectTo: result.destination
      },
      kind: "landing" as const,
      slug,
      title: null,
      type: "link"
    };
  }

  renderInactiveHtml() {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>QR inactive</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f0e8; color: #1d1206; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      main { max-width: 520px; padding: 32px; background: white; border-radius: 24px; box-shadow: 0 24px 80px rgba(45, 26, 8, 0.12); }
      h1 { margin-top: 0; }
      a { color: #8b4d16; }
    </style>
  </head>
  <body>
    <main>
      <h1>This QR code is inactive</h1>
      <p>The owner either disabled it, reached a scan limit, or the code expired.</p>
      <p>If you manage this QR code, sign in to the dashboard and reactivate it there.</p>
    </main>
  </body>
</html>`;
  }

  renderPasswordHtml(slug: string, errorMessage?: string) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Password required</title>
    <style>
      body { font-family: Arial, sans-serif; background: #eef3f8; color: #11243a; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      form { max-width: 420px; width: 100%; padding: 32px; background: white; border-radius: 24px; box-shadow: 0 24px 80px rgba(17, 36, 58, 0.12); }
      input, button { width: 100%; box-sizing: border-box; padding: 14px 16px; border-radius: 14px; border: 1px solid #c9d5e3; margin-top: 12px; }
      button { background: #173f6b; color: white; border: none; cursor: pointer; }
      .error { color: #a71d31; margin-top: 12px; }
    </style>
  </head>
  <body>
    <form method="post" action="/r/${slug}/password">
      <h1>Password required</h1>
      <p>This QR code is protected. Enter the password to continue.</p>
      <input type="password" name="password" placeholder="Password" required />
      ${errorMessage ? `<div class="error">${this.escapeHtml(errorMessage)}</div>` : ""}
      <button type="submit">Continue</button>
    </form>
  </body>
</html>`;
  }

  renderLandingHtml(result: Extract<ScanResult, { kind: "landing" }>) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${this.escapeHtml(result.title ?? result.slug)}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f7f7fb; color: #121826; margin: 0; padding: 40px 20px; }
      main { max-width: 720px; margin: 0 auto; background: white; border-radius: 24px; padding: 32px; box-shadow: 0 24px 80px rgba(18, 24, 38, 0.1); }
      pre { white-space: pre-wrap; word-break: break-word; background: #0f172a; color: #e2e8f0; padding: 20px; border-radius: 16px; overflow: auto; }
      .meta { color: #596273; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <div class="meta">${this.escapeHtml(result.type)}</div>
      <h1>${this.escapeHtml(result.title ?? "QR content")}</h1>
      <pre>${this.escapeHtml(JSON.stringify(result.content, null, 2))}</pre>
    </main>
  </body>
</html>`;
  }

  renderRateLimitedHtml(retryAfterSeconds: number) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Too many scans</title>
    <style>
      body { font-family: Arial, sans-serif; background: #fff4e6; color: #6b3b09; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      main { max-width: 520px; padding: 32px; background: white; border-radius: 24px; box-shadow: 0 24px 80px rgba(107, 59, 9, 0.12); }
      h1 { margin-top: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Too many scan attempts</h1>
      <p>This QR code is temporarily rate-limited. Please retry in about ${retryAfterSeconds} seconds.</p>
    </main>
  </body>
</html>`;
  }

  private async loadQrCode(slug: string) {
    const cached = await this.slugCache.get(slug);

    if (cached && !cached.isOneTime && cached.maxScans === null) {
      return this.hydrateCachedRecord(cached);
    }

    const qrCode = await this.prisma.qRCode.findUnique({
      where: { slug },
      include: {
        content: true,
        redirectRules: true
      }
    });

    if (
      qrCode &&
      qrCode.status === "ACTIVE" &&
      !qrCode.isOneTime &&
      qrCode.maxScans === null
    ) {
      await this.slugCache.set(slug, qrCode);
    }

    return qrCode;
  }

  private async touchSuccessfulScan(qrCode: ScanRecord) {
    const reachedLimit =
      qrCode.maxScans !== null && Number(qrCode.scansCount) + 1 >= qrCode.maxScans;
    const shouldDeactivate = qrCode.isOneTime || reachedLimit;
    const now = new Date();

    if (shouldDeactivate) {
      await this.prisma.qRCode.update({
        where: { id: qrCode.id },
        data: {
          lastScanAt: now,
          scansCount: {
            increment: BigInt(1)
          },
          status: "INACTIVE"
        }
      });

      await this.slugCache.delete(qrCode.slug);
      return;
    }

    await this.prisma.qRCode.update({
      where: { id: qrCode.id },
      data: {
        lastScanAt: now,
        scansCount: {
          increment: BigInt(1)
        }
      }
    });
  }

  private async recordOutcome(
    qrCode: ScanRecord,
    metadata: ReturnType<ScanService["extractRequestMetadata"]>,
    outcome: ScanOutcome,
    redirectRuleId?: string
  ) {
    const scanWrite = this.scanEvents.recordScanEvent({
      awaitAggregate: process.env.SCAN_WRITE_SYNC === "true",
      browser: metadata.browser,
      country: metadata.country,
      deviceType: metadata.deviceType,
      ipHash: metadata.ipHash,
      language: metadata.language,
      openedOk: outcome === "REDIRECTED" || outcome === "LANDED",
      os: metadata.os,
      outcome,
      qrCodeId: qrCode.id,
      redirectRuleId,
      referrer: metadata.referrer,
      requestId: metadata.requestId,
      scannedAt: new Date(),
      userAgent: metadata.userAgent
    });

    if (process.env.SCAN_WRITE_SYNC === "true") {
      await scanWrite;
    } else {
      void scanWrite.catch((error) => {
        this.logger.error(
          "scan.outcome_record_failed",
          error,
          {
            outcome,
            qrCodeId: qrCode.id,
            requestId: metadata.requestId
          },
          ScanService.name
        );
      });
    }

    this.telemetry.track("scan.resolved", {
      outcome,
      qrCodeId: qrCode.id,
      slug: qrCode.slug
    });
  }

  private findMatchingRule(qrCode: ScanRecord, request: Request) {
    const language = this.extractPrimaryLanguage(request.headers["accept-language"]);
    const country = this.extractCountry(request);
    const deviceType = this.detectDeviceType(request.headers["user-agent"]);
    const os = this.detectOperatingSystem(request.headers["user-agent"]);
    const now = new Date();

    return [...qrCode.redirectRules]
      .sort((a, b) => a.priority - b.priority)
      .find((rule) => {
        if (!rule.enabled) {
          return false;
        }

        if (rule.startAt && rule.startAt > now) {
          return false;
        }

        if (rule.endAt && rule.endAt < now) {
          return false;
        }

        if (!this.matchesJsonArray(rule.countryCodes, country)) {
          return false;
        }

        if (!this.matchesJsonArray(rule.languages, language)) {
          return false;
        }

        if (!this.matchesJsonArray(rule.deviceTypes, deviceType)) {
          return false;
        }

        if (!this.matchesJsonArray(rule.operatingSystems, os)) {
          return false;
        }

        return true;
      });
  }

  private matchesJsonArray(value: Prisma.JsonValue | null, current: string | null) {
    if (!value) {
      return true;
    }

    if (!current) {
      return false;
    }

    if (!Array.isArray(value)) {
      return true;
    }

    return value.some(
      (item) => String(item).toLowerCase() === current.toLowerCase()
    );
  }

  private extractRequestMetadata(request: Request) {
    const userAgent = request.headers["user-agent"] ?? null;
    const ipAddress = request.ip || request.socket.remoteAddress || null;

    return {
      browser: this.detectBrowser(userAgent),
      country: this.extractCountry(request),
      deviceType: this.detectDeviceType(userAgent),
      ipAddress,
      ipHash: ipAddress ? this.hashIp(ipAddress) : null,
      language: this.extractPrimaryLanguage(request.headers["accept-language"]),
      os: this.detectOperatingSystem(userAgent),
      referrer: request.headers.referer ?? null,
      requestId:
        (Array.isArray(request.headers["x-request-id"])
          ? request.headers["x-request-id"][0]
          : request.headers["x-request-id"]) ?? randomUUID(),
      userAgent
    };
  }

  private extractCountry(request: Request) {
    const value =
      request.headers["cf-ipcountry"] ??
      request.headers["x-vercel-ip-country"] ??
      request.headers["x-country"];

    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }

  private extractPrimaryLanguage(value: string | string[] | null | undefined) {
    const language = Array.isArray(value) ? value[0] : value;
    return language?.split(",")[0]?.split("-")[0] ?? null;
  }

  private detectDeviceType(userAgent: string | string[] | null | undefined) {
    const value = Array.isArray(userAgent) ? userAgent[0] ?? "" : userAgent ?? "";

    if (/tablet|ipad/i.test(value)) {
      return "tablet";
    }

    if (/mobile|iphone|android/i.test(value)) {
      return "mobile";
    }

    if (/bot|crawl|spider/i.test(value)) {
      return "bot";
    }

    return "desktop";
  }

  private detectOperatingSystem(userAgent: string | string[] | null | undefined) {
    const value = Array.isArray(userAgent) ? userAgent[0] ?? "" : userAgent ?? "";

    if (/windows/i.test(value)) {
      return "windows";
    }

    if (/android/i.test(value)) {
      return "android";
    }

    if (/iphone|ipad|ios/i.test(value)) {
      return "ios";
    }

    if (/mac os/i.test(value)) {
      return "macos";
    }

    if (/linux/i.test(value)) {
      return "linux";
    }

    return "unknown";
  }

  private detectBrowser(userAgent: string | string[] | null | undefined) {
    const value = Array.isArray(userAgent) ? userAgent[0] ?? "" : userAgent ?? "";

    if (/edg/i.test(value)) {
      return "edge";
    }

    if (/chrome/i.test(value)) {
      return "chrome";
    }

    if (/safari/i.test(value) && !/chrome/i.test(value)) {
      return "safari";
    }

    if (/firefox/i.test(value)) {
      return "firefox";
    }

    return "unknown";
  }

  private hashIp(value: string) {
    return createHash("sha256")
      .update(`${process.env.IP_HASH_SALT ?? process.env.JWT_SECRET ?? "qrflow"}:${value}`)
      .digest("hex");
  }

  private hydrateCachedRecord(value: ScanRecord) {
    return {
      ...value,
      archivedAt: value.archivedAt ? new Date(value.archivedAt) : null,
      createdAt: new Date(value.createdAt),
      deletedAt: value.deletedAt ? new Date(value.deletedAt) : null,
      expiresAt: value.expiresAt ? new Date(value.expiresAt) : null,
      lastScanAt: value.lastScanAt ? new Date(value.lastScanAt) : null,
      scansCount:
        typeof value.scansCount === "string"
          ? BigInt(value.scansCount)
          : value.scansCount,
      updatedAt: new Date(value.updatedAt),
      content: value.content
        ? {
            ...value.content,
            createdAt: new Date(value.content.createdAt),
            updatedAt: new Date(value.content.updatedAt)
          }
        : null,
      redirectRules: value.redirectRules.map((rule) => ({
        ...rule,
        createdAt: new Date(rule.createdAt),
        endAt: rule.endAt ? new Date(rule.endAt) : null,
        startAt: rule.startAt ? new Date(rule.startAt) : null,
        updatedAt: new Date(rule.updatedAt)
      }))
    };
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
