import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema
} from "@qr/types";
import { PrismaService } from "../../common/prisma.service";
import { TelemetryService } from "../../common/telemetry.service";
import { parseWithSchema } from "../../common/zod.util";

type SessionWithUser = Prisma.SessionGetPayload<{
  include: { user: true };
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService
  ) {}

  async register(payload: unknown) {
    const input = parseWithSchema(registerSchema, payload);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email }
    });

    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const passwordHash = await hash(input.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          locale: "en",
          passwordHash
        }
      });

      const workspaceSlug = await this.generateUniqueWorkspaceSlug(
        tx,
        input.fullName ?? input.email.split("@")[0] ?? "workspace"
      );

      const workspaceName = input.fullName
        ? `${input.fullName}'s workspace`
        : `${input.email.split("@")[0]} workspace`;

      const workspace = await tx.workspace.create({
        data: {
          ownerUserId: createdUser.id,
          name: workspaceName,
          slug: workspaceSlug
        }
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: createdUser.id,
          role: "OWNER"
        }
      });

      return createdUser;
    });

    const session = await this.createSession(user.id);

    this.telemetry.track("auth.registered", {
      userId: user.id
    });

    return {
      accessToken: session.token,
      user: this.serializeUser(user)
    };
  }

  async login(payload: unknown) {
    const input = parseWithSchema(loginSchema, payload);

    const user = await this.prisma.user.findUnique({
      where: { email: input.email }
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const isPasswordValid = await compare(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const session = await this.createSession(user.id);

    this.telemetry.track("auth.logged_in", {
      userId: user.id
    });

    return {
      accessToken: session.token,
      user: this.serializeUser(user)
    };
  }

  async logout(sessionId: string) {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() }
    });

    this.telemetry.track("auth.logged_out", {
      sessionId
    });

    return {
      success: true
    };
  }

  async resolveSession(token: string) {
    const tokenHash = this.hashToken(token);

    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: true
      }
    });

    if (!session) {
      return null;
    }

    void this.prisma.session.update({
      where: { id: session.id },
      data: {
        lastUsedAt: new Date()
      }
    }).catch(() => undefined);

    return session;
  }

  serializeUser(user: User) {
    return {
      avatarUrl: user.avatarUrl,
      email: user.email,
      fullName: user.fullName,
      id: user.id,
      locale: user.locale
    };
  }

  async forgotPassword(payload: unknown) {
    const input = parseWithSchema(forgotPasswordSchema, payload);
    const user = await this.prisma.user.findUnique({
      where: { email: input.email }
    });

    if (!user?.passwordHash) {
      return {
        success: true
      };
    }

    const resetToken = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(resetToken);
    const expiresAt = new Date(
      Date.now() + this.getResetTokenTtlMinutes() * 60 * 1000
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: {
          usedAt: null,
          userId: user.id
        },
        data: {
          usedAt: new Date()
        }
      });

      await tx.passwordResetToken.create({
        data: {
          expiresAt,
          tokenHash,
          userId: user.id
        }
      });
    });

    this.telemetry.track("auth.password_reset_requested", {
      userId: user.id
    });

    return {
      expiresAt: expiresAt.toISOString(),
      resetToken: this.shouldExposeResetToken() ? resetToken : undefined,
      success: true
    };
  }

  async resetPassword(payload: unknown) {
    const input = parseWithSchema(resetPasswordSchema, payload);
    const tokenHash = this.hashToken(input.token);
    const passwordHash = await hash(input.password, 12);
    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        expiresAt: {
          gt: new Date()
        },
        tokenHash,
        usedAt: null
      },
      include: {
        user: true
      }
    });

    if (!token?.user?.passwordHash) {
      throw new UnauthorizedException("Reset token is invalid or expired");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: token.userId
        },
        data: {
          passwordHash
        }
      });

      await tx.passwordResetToken.update({
        where: {
          id: token.id
        },
        data: {
          usedAt: new Date()
        }
      });

      await tx.session.updateMany({
        where: {
          revokedAt: null,
          userId: token.userId
        },
        data: {
          revokedAt: new Date()
        }
      });
    });

    const session = await this.createSession(token.userId);

    this.telemetry.track("auth.password_reset_completed", {
      userId: token.userId
    });

    return {
      accessToken: session.token,
      user: this.serializeUser(token.user)
    };
  }

  async updateProfile(userId: string, payload: unknown) {
    const input = parseWithSchema(updateProfileSchema, payload);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl:
          input.avatarUrl !== undefined ? input.avatarUrl : undefined,
        fullName:
          input.fullName !== undefined ? input.fullName : undefined,
        locale: input.locale !== undefined ? input.locale : undefined
      }
    });

    this.telemetry.track("auth.profile_updated", {
      userId
    });

    return this.serializeUser(user);
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(
      Date.now() + this.getSessionTtlHours() * 60 * 60 * 1000
    );

    const session = await this.prisma.session.create({
      data: {
        expiresAt,
        tokenHash,
        userId
      }
    });

    return {
      expiresAt: session.expiresAt,
      id: session.id,
      token
    };
  }

  private getSessionTtlHours() {
    const rawTtl = Number(process.env.SESSION_TTL_HOURS ?? "720");
    return Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 720;
  }

  private hashToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private getResetTokenTtlMinutes() {
    const rawTtl = Number(process.env.RESET_TOKEN_TTL_MINUTES ?? "30");
    return Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 30;
  }

  private shouldExposeResetToken() {
    return process.env.NODE_ENV !== "production";
  }

  private async generateUniqueWorkspaceSlug(
    tx: Prisma.TransactionClient,
    seed: string
  ) {
    const normalizedSeed = seed
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace";

    let candidate = normalizedSeed;
    let counter = 1;

    while (await tx.workspace.findUnique({ where: { slug: candidate } })) {
      counter += 1;
      candidate = `${normalizedSeed}-${counter}`;
    }

    return candidate;
  }
}
