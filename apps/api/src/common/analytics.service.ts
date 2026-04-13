import { Injectable } from "@nestjs/common";
import { Prisma, ScanOutcome } from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";
import { TelemetryService } from "./telemetry.service";

type ScanEventInput = {
  browser: string | null;
  country: string | null;
  deviceType: string | null;
  ipHash: string | null;
  language: string | null;
  openedOk: boolean | null;
  os: string | null;
  outcome: ScanOutcome;
  qrCodeId: string;
  redirectRuleId?: string;
  referrer: string | null;
  requestId: string | null;
  scannedAt: Date;
  userAgent: string | null;
};

const ANALYTICS_GROUP_LIMIT = 10;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService
  ) {}

  recordScanEvent(input: ScanEventInput) {
    return this.prisma.$transaction(async (tx) => {
      await tx.scanEvent.create({
        data: {
          browser: input.browser,
          city: null,
          country: input.country,
          deviceType: input.deviceType,
          ipHash: input.ipHash,
          language: input.language,
          openedOk: input.openedOk,
          os: input.os,
          outcome: input.outcome,
          qrCodeId: input.qrCodeId,
          redirectRuleId: input.redirectRuleId,
          referrer: input.referrer,
          requestId: input.requestId,
          scannedAt: input.scannedAt,
          userAgent: input.userAgent
        }
      });

      const day = new Date(input.scannedAt);
      day.setUTCHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      const dayEvents = await tx.scanEvent.findMany({
        where: {
          qrCodeId: input.qrCodeId,
          scannedAt: {
            gte: day,
            lt: nextDay
          }
        },
        select: {
          browser: true,
          country: true,
          deviceType: true,
          ipHash: true,
          os: true
        }
      });

      const devices = this.buildCounts(dayEvents.map((event) => event.deviceType));
      const countries = this.buildCounts(dayEvents.map((event) => event.country));
      const browsers = this.buildCounts(dayEvents.map((event) => event.browser));
      const operatingSystems = this.buildCounts(dayEvents.map((event) => event.os));

      await tx.scanAggregateDaily.upsert({
        where: {
          qrCodeId_day: {
            day,
            qrCodeId: input.qrCodeId
          }
        },
        create: {
          browsers,
          countries,
          day,
          devices,
          operatingSystems,
          qrCodeId: input.qrCodeId,
          scans: dayEvents.length,
          uniqueDevices: new Set(
            dayEvents
              .map((event) => event.deviceType?.trim().toLowerCase())
              .filter(Boolean)
          ).size,
          uniqueIps: new Set(
            dayEvents.map((event) => event.ipHash).filter(Boolean)
          ).size
        },
        update: {
          browsers,
          countries,
          devices,
          operatingSystems,
          scans: dayEvents.length,
          uniqueDevices: new Set(
            dayEvents
              .map((event) => event.deviceType?.trim().toLowerCase())
              .filter(Boolean)
          ).size,
          uniqueIps: new Set(
            dayEvents.map((event) => event.ipHash).filter(Boolean)
          ).size
        }
      });
    }).then(() => {
      this.telemetry.track("analytics.scan_recorded", {
        outcome: input.outcome,
        qrCodeId: input.qrCodeId
      });
    });
  }

  async getQrAnalytics(qrCodeId: string, query: { from?: string; to?: string }) {
    const dateRange = this.buildDateRange(query);

    const [daily, recentEvents, summaryEvents] = await this.prisma.$transaction([
      this.prisma.scanAggregateDaily.findMany({
        where: {
          day: dateRange,
          qrCodeId
        },
        orderBy: {
          day: "asc"
        }
      }),
      this.prisma.scanEvent.findMany({
        where: {
          qrCodeId,
          scannedAt: dateRange
        },
        orderBy: {
          scannedAt: "desc"
        },
        take: 20
      }),
      this.prisma.scanEvent.findMany({
        where: {
          qrCodeId,
          scannedAt: dateRange
        },
        select: {
          deviceType: true,
          ipHash: true
        }
      })
    ]);

    return {
      daily: daily.map((entry) => ({
        browsers: entry.browsers,
        countries: entry.countries,
        day: entry.day.toISOString().slice(0, 10),
        devices: entry.devices,
        operatingSystems: entry.operatingSystems,
        scans: entry.scans,
        uniqueDevices: entry.uniqueDevices,
        uniqueIps: entry.uniqueIps
      })),
      recentEvents: recentEvents.map((event) => ({
        browser: event.browser,
        country: event.country,
        deviceType: event.deviceType,
        language: event.language,
        openedOk: event.openedOk,
        outcome: event.outcome,
        referrer: event.referrer,
        requestId: event.requestId,
        scannedAt: event.scannedAt.toISOString()
      })),
      summary: {
        scans: daily.reduce((total, entry) => total + entry.scans, 0),
        uniqueDevices: new Set(
          summaryEvents
            .map((event) => event.deviceType?.trim().toLowerCase())
            .filter(Boolean)
        ).size,
        uniqueIps: new Set(
          summaryEvents.map((event) => event.ipHash).filter(Boolean)
        ).size
      }
    };
  }

  private buildDateRange(query: { from?: string; to?: string }) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

    if (!Number.isNaN(from.valueOf())) {
      from.setUTCHours(0, 0, 0, 0);
    }

    if (!Number.isNaN(to.valueOf())) {
      to.setUTCHours(23, 59, 59, 999);
    }

    return {
      gte: from,
      lte: to
    };
  }

  private buildCounts(values: Array<string | null>): Prisma.InputJsonValue {
    const counts = new Map<string, number>();

    for (const value of values) {
      const normalizedValue = value?.trim();

      if (!normalizedValue) {
        continue;
      }

      counts.set(normalizedValue, (counts.get(normalizedValue) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, ANALYTICS_GROUP_LIMIT)
      .reduce<Record<string, number>>((accumulator, [key, count]) => {
        accumulator[key] = count;
        return accumulator;
      }, {});
  }
}
