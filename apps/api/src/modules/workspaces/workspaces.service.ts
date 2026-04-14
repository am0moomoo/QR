import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  billingPlanCatalog,
  bulkExportQuerySchema,
  bulkImportSchema,
  createCustomDomainSchema,
  createFolderSchema,
  createWorkspaceSchema,
  getQrContentSchema,
  normalizeCustomDomain,
  qrDesignSchema,
  qrSettingsSchema,
  verifyCustomDomainSchema
} from "@qr/types";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../../common/prisma.service";
import { QrAssetPipelineService } from "../../common/qr-asset-pipeline.service";
import { RenderQueueService } from "../../common/render-queue.service";
import { StructuredLoggerService } from "../../common/structured-logger.service";
import {
  getPreferredCustomDomain,
  getWorkspaceBrandingVersion,
  getWorkspaceShortBaseUrl
} from "../../common/workspace-branding.util";
import { parseWithSchema as parseWithZodSchema } from "../../common/zod.util";
import { QrCodesService } from "../qr-codes/qr-codes.service";

const defaultImportDesign = qrDesignSchema.parse({});
const defaultImportSettings = qrSettingsSchema.parse({});

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrCodes: QrCodesService,
    private readonly renderQueue: RenderQueueService,
    private readonly assetPipeline: QrAssetPipelineService,
    private readonly logger: StructuredLoggerService
  ) {}

  async list(userId: string) {
    const workspaces = await this.prisma.workspace.findMany({
      where: {
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
      },
      include: {
        customDomains: {
          orderBy: [
            { status: "asc" },
            { createdAt: "asc" }
          ]
        },
        folders: {
          where: {
            ownerUserId: userId
          }
        },
        members: {
          where: {
            userId
          },
          select: {
            role: true
          }
        },
        _count: {
          select: {
            customDomains: true,
            folders: true,
            qrCodes: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return {
      items: workspaces.map((workspace) => ({
        createdAt: workspace.createdAt.toISOString(),
        customDomain: getPreferredCustomDomain(workspace)?.domain ?? null,
        customDomainCount: workspace._count.customDomains,
        folderCount: workspace._count.folders,
        id: workspace.id,
        name: workspace.name,
        plan: workspace.plan.toLowerCase(),
        qrCodeCount: workspace._count.qrCodes,
        role: workspace.members[0]?.role ?? "OWNER",
        slug: workspace.slug,
        updatedAt: workspace.updatedAt.toISOString()
      }))
    };
  }

  async createWorkspace(userId: string, payload: unknown) {
    const input = parseWithZodSchema(createWorkspaceSchema, payload);
    const slug = await this.generateUniqueWorkspaceSlug(input.name);
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: input.name,
          ownerUserId: userId,
          slug
        }
      });

      await tx.workspaceMember.create({
        data: {
          role: "OWNER",
          userId,
          workspaceId: created.id
        }
      });

      return created;
    });

    return {
      createdAt: workspace.createdAt.toISOString(),
      customDomain: null,
      customDomainCount: 0,
      folderCount: 0,
      id: workspace.id,
      name: workspace.name,
      plan: workspace.plan.toLowerCase(),
      qrCodeCount: 0,
      role: "OWNER",
      slug: workspace.slug,
      updatedAt: workspace.updatedAt.toISOString()
    };
  }

  async listFolders(userId: string, workspaceId: string) {
    await this.requireWorkspaceAccess(workspaceId, userId);

    const folders = await this.prisma.folder.findMany({
      where: {
        workspaceId
      },
      include: {
        _count: {
          select: {
            qrCodes: true
          }
        }
      },
      orderBy: [
        { parentId: "asc" },
        { name: "asc" }
      ]
    });

    return {
      items: folders.map((folder) => ({
        createdAt: folder.createdAt.toISOString(),
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        qrCodeCount: folder._count.qrCodes,
        updatedAt: folder.updatedAt.toISOString(),
        workspaceId: folder.workspaceId
      }))
    };
  }

  async createFolder(userId: string, workspaceId: string, payload: unknown) {
    const workspace = await this.requireWorkspaceAccess(workspaceId, userId);
    const input = parseWithZodSchema(createFolderSchema, payload);

    if (input.parentId) {
      const parentFolder = await this.prisma.folder.findFirst({
        where: {
          id: input.parentId,
          workspaceId
        }
      });

      if (!parentFolder) {
        throw new BadRequestException("Parent folder is not available in this workspace.");
      }
    }

    const folder = await this.prisma.folder.create({
      data: {
        name: input.name,
        ownerUserId: userId,
        parentId: input.parentId,
        workspaceId: workspace.id
      },
      include: {
        _count: {
          select: {
            qrCodes: true
          }
        }
      }
    });

    return {
      createdAt: folder.createdAt.toISOString(),
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      qrCodeCount: folder._count.qrCodes,
      updatedAt: folder.updatedAt.toISOString(),
      workspaceId: folder.workspaceId
    };
  }

  async listCustomDomains(userId: string, workspaceId: string) {
    const workspace = await this.requireWorkspaceAccess(workspaceId, userId);
    const domains = await this.prisma.customDomain.findMany({
      where: {
        workspaceId: workspace.id
      },
      orderBy: [
        { status: "asc" },
        { createdAt: "asc" }
      ]
    });

    return {
      items: domains.map((domain) => this.serializeCustomDomain(domain))
    };
  }

  async createCustomDomain(userId: string, workspaceId: string, payload: unknown) {
    const workspace = await this.requireWorkspaceAccess(workspaceId, userId);
    const input = parseWithZodSchema(createCustomDomainSchema, payload);

    try {
      const domain = await this.prisma.customDomain.create({
        data: {
          certificateStatus: null,
          domain: normalizeCustomDomain(input.domain),
          status: "pending",
          verificationToken: this.generateVerificationToken(),
          workspaceId: workspace.id
        }
      });

      return this.serializeCustomDomain(domain);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        throw new ConflictException("This domain is already connected to another workspace.");
      }

      throw error;
    }
  }

  async verifyCustomDomain(
    userId: string,
    workspaceId: string,
    domainId: string,
    payload: unknown
  ) {
    await this.requireWorkspaceAccess(workspaceId, userId);
    const input = parseWithZodSchema(verifyCustomDomainSchema, payload);
    const domain = await this.requireCustomDomainAccess(workspaceId, domainId);

    if (domain.verificationToken !== input.verificationToken) {
      throw new BadRequestException("Verification token does not match this custom domain.");
    }

    const updatedDomain = await this.prisma.customDomain.update({
      where: {
        id: domain.id
      },
      data: {
        certificateStatus: "local-verified",
        status: "verified"
      }
    });

    await this.refreshWorkspaceQrAssets(workspaceId);
    return this.serializeCustomDomain(updatedDomain);
  }

  async deleteCustomDomain(userId: string, workspaceId: string, domainId: string) {
    await this.requireWorkspaceAccess(workspaceId, userId);
    await this.requireCustomDomainAccess(workspaceId, domainId);

    await this.prisma.customDomain.delete({
      where: {
        id: domainId
      }
    });

    await this.refreshWorkspaceQrAssets(workspaceId);

    return {
      success: true
    };
  }

  async exportQrCodes(
    userId: string,
    workspaceId: string,
    query: unknown
  ) {
    const workspace = await this.requireWorkspaceAccess(workspaceId, userId);
    const input = parseWithZodSchema(bulkExportQuerySchema, query);
    const qrCodes = await this.prisma.qRCode.findMany({
      where: {
        deletedAt: null,
        workspaceId: workspace.id
      },
      include: {
        content: true,
        folder: true,
        workspace: {
          include: {
            customDomains: true
          }
        }
      },
      orderBy: {
        createdAt: "asc"
      }
    });
    const rows = qrCodes.map((qrCode) => ({
      createdAt: qrCode.createdAt.toISOString(),
      folder: qrCode.folder?.name ?? "",
      link:
        typeof qrCode.content?.payload === "object" &&
        qrCode.content?.payload &&
        "link" in (qrCode.content.payload as Record<string, unknown>)
          ? String((qrCode.content.payload as Record<string, unknown>).link ?? "")
          : "",
      shortUrl: `${getWorkspaceShortBaseUrl(qrCode.workspace)}/r/${qrCode.slug}`,
      slug: qrCode.slug,
      status: qrCode.status,
      title: qrCode.title ?? "",
      type: qrCode.type,
      updatedAt: qrCode.updatedAt.toISOString()
    }));

    if (input.format === "csv") {
      const csv = this.toCsv([
        [
          "title",
          "link",
          "type",
          "status",
          "folder",
          "slug",
          "shortUrl",
          "createdAt",
          "updatedAt"
        ],
        ...rows.map((row) => [
          row.title,
          row.link,
          row.type,
          row.status,
          row.folder,
          row.slug,
          row.shortUrl,
          row.createdAt,
          row.updatedAt
        ])
      ]);

      return {
        body: Buffer.from(csv, "utf8"),
        contentType: "text/csv; charset=utf-8",
        fileName: `${workspace.slug}-qr-codes.csv`
      };
    }

    return {
      body: Buffer.from(JSON.stringify(rows, null, 2), "utf8"),
      contentType: "application/json; charset=utf-8",
      fileName: `${workspace.slug}-qr-codes.json`
    };
  }

  async importQrCodes(
    userId: string,
    workspaceId: string,
    payload: unknown
  ) {
    const workspace = await this.requireWorkspaceAccess(workspaceId, userId);
    const input = parseWithZodSchema(bulkImportSchema, payload);

    if (input.folderId) {
      const folder = await this.prisma.folder.findFirst({
        where: {
          id: input.folderId,
          workspaceId
        }
      });

      if (!folder) {
        throw new BadRequestException("Selected folder is not available in this workspace.");
      }
    }

    const rows = this.parseImportRows(input.format, input.data);

    if (rows.length === 0) {
      throw new BadRequestException("Import data does not contain any QR rows.");
    }

    if (rows.length > 50) {
      throw new BadRequestException("Import up to 50 QR codes per batch.");
    }

    const existingQrCount = await this.prisma.qRCode.count({
      where: {
        deletedAt: null,
        workspaceId
      }
    });
    const plan = workspace.plan.toLowerCase();
    const maxQrCodes = billingPlanCatalog[plan as keyof typeof billingPlanCatalog]?.maxQrCodes ?? 3;

    if (existingQrCount + rows.length > maxQrCodes) {
      throw new ForbiddenException(
        `This workspace can import up to ${maxQrCodes - existingQrCount} more QR codes on the current plan. Upgrade or reduce the import size before trying again.`
      );
    }

    const created = [];

    for (const row of rows) {
      const createdQr = await this.qrCodes.create(userId, {
        content: {
          link: row.link
        },
        design: defaultImportDesign,
        exports: ["png", "svg"],
        folderId: input.folderId,
        settings: defaultImportSettings,
        title: row.title,
        type: "link",
        workspaceId
      });
      created.push(createdQr);
    }

    this.logger.info(
      "workspace.qr_import_completed",
      {
        createdCount: created.length,
        workspaceId
      },
      WorkspacesService.name
    );

    return {
      created,
      createdCount: created.length,
      workspaceId
    };
  }

  private async refreshWorkspaceQrAssets(workspaceId: string) {
    const qrCodes = await this.prisma.qRCode.findMany({
      where: {
        deletedAt: null,
        workspaceId
      },
      select: {
        id: true
      }
    });

    for (const qrCode of qrCodes) {
      const snapshot = await this.assetPipeline.getQrCodeSnapshot(qrCode.id);
      await this.renderQueue.render(
        snapshot.id,
        this.assetPipeline.getExistingExportFormats(snapshot),
        `${snapshot.updatedAt.toISOString()}:${getWorkspaceBrandingVersion(snapshot.workspace)}`
      );
    }
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
      throw new ForbiddenException("Workspace is not accessible.");
    }

    return workspace;
  }

  private async requireCustomDomainAccess(workspaceId: string, domainId: string) {
    const domain = await this.prisma.customDomain.findFirst({
      where: {
        id: domainId,
        workspaceId
      }
    });

    if (!domain) {
      throw new NotFoundException("Custom domain was not found.");
    }

    return domain;
  }

  private serializeCustomDomain(
    domain: Prisma.CustomDomainGetPayload<Record<string, never>>
  ) {
    const targetOrigin = new URL(
      process.env.SHORT_DOMAIN ??
        process.env.API_URL ??
        "http://localhost:4000"
    );

    return {
      certificateStatus: domain.certificateStatus,
      createdAt: domain.createdAt.toISOString(),
      domain: domain.domain,
      id: domain.id,
      shortBaseUrl: `https://${domain.domain}`,
      status: domain.status,
      targetHost: targetOrigin.host,
      txtRecordHost: `_qrflow-challenge.${domain.domain}`,
      txtRecordValue: domain.verificationToken,
      updatedAt: domain.updatedAt.toISOString(),
      verificationToken: domain.verificationToken
    };
  }

  private async generateUniqueWorkspaceSlug(name: string) {
    const baseSlug =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "workspace";

    let candidate = baseSlug;
    let counter = 1;

    while (await this.prisma.workspace.findUnique({ where: { slug: candidate } })) {
      counter += 1;
      candidate = `${baseSlug}-${counter}`;
    }

    return candidate;
  }

  private generateVerificationToken() {
    return `verify_${randomBytes(12).toString("hex")}`;
  }

  private parseImportRows(format: "csv" | "json", rawValue: string) {
    if (format === "json") {
      let parsedValue: unknown;

      try {
        parsedValue = JSON.parse(rawValue);
      } catch {
        throw new BadRequestException("JSON import data must be valid JSON.");
      }

      if (!Array.isArray(parsedValue)) {
        throw new BadRequestException("JSON import data must be an array of rows.");
      }

      return parsedValue.map((row, index) =>
        this.normalizeImportRow(row, `Row ${index + 1}`)
      );
    }

    const rows = this.parseCsv(rawValue);

    if (rows.length < 2) {
      return [];
    }

    const header = rows[0]!.map((cell) => cell.trim().toLowerCase());
    const titleIndex = header.indexOf("title");
    const linkIndex = header.indexOf("link");

    if (linkIndex < 0) {
      throw new BadRequestException("CSV import must include a link column.");
    }

    return rows
      .slice(1)
      .filter((row) => row.some((cell) => cell.trim().length > 0))
      .map((row, index) =>
        this.normalizeImportRow(
          {
            link: row[linkIndex] ?? "",
            title: titleIndex >= 0 ? row[titleIndex] ?? "" : ""
          },
          `Row ${index + 2}`
        )
      );
  }

  private normalizeImportRow(value: unknown, label: string) {
    if (!value || typeof value !== "object") {
      throw new BadRequestException(`${label} must be an object with title and link fields.`);
    }

    const row = value as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const link = typeof row.link === "string" ? row.link.trim() : "";

    if (!link) {
      throw new BadRequestException(`${label} is missing a link value.`);
    }

    parseWithZodSchema(getQrContentSchema("link") as z.ZodTypeAny, {
      link
    });

    return {
      link,
      title: title || null
    };
  }

  private parseCsv(rawValue: string) {
    const rows: string[][] = [];
    let currentCell = "";
    let currentRow: string[] = [];
    let inQuotes = false;

    for (let index = 0; index < rawValue.length; index += 1) {
      const character = rawValue[index] ?? "";
      const nextCharacter = rawValue[index + 1] ?? "";

      if (character === "\"") {
        if (inQuotes && nextCharacter === "\"") {
          currentCell += "\"";
          index += 1;
          continue;
        }

        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && character === ",") {
        currentRow.push(currentCell);
        currentCell = "";
        continue;
      }

      if (!inQuotes && (character === "\n" || character === "\r")) {
        if (character === "\r" && nextCharacter === "\n") {
          index += 1;
        }

        currentRow.push(currentCell);
        rows.push(currentRow);
        currentCell = "";
        currentRow = [];
        continue;
      }

      currentCell += character;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    return rows;
  }

  private toCsv(rows: string[][]) {
    return rows
      .map((row) =>
        row
          .map((value) => {
            const normalized = String(value ?? "");
            if (/[",\n\r]/.test(normalized)) {
              return `"${normalized.replace(/"/g, "\"\"")}"`;
            }

            return normalized;
          })
          .join(",")
      )
      .join("\n");
  }
}
