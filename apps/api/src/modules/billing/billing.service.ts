import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Plan,
  Prisma,
  SubscriptionStatus
} from "@prisma/client";
import {
  billingPlanCatalog,
  billingPlanCodes,
  billingSummaryQuerySchema,
  cancelSubscriptionSchema,
  createCheckoutSessionSchema,
  type PlanName,
  type QrSettingsInput
} from "@qr/types";
import Stripe from "stripe";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../../common/prisma.service";
import { StructuredLoggerService } from "../../common/structured-logger.service";
import { TelemetryService } from "../../common/telemetry.service";
import { assertAllowedReturnUrl } from "../../common/url-safety";
import { parseWithSchema } from "../../common/zod.util";

type StripeProviderMode = "mock" | "stripe";

type WorkspaceWithOwner = Prisma.WorkspaceGetPayload<{
  include: {
    owner: true;
  };
}>;

@Injectable()
export class BillingService {
  private readonly stripeClient: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
    private readonly logger: StructuredLoggerService
  ) {
    this.stripeClient = this.createStripeClient();
  }

  listPlans() {
    return {
      items: billingPlanCodes.map((code) => this.serializePlan(code)),
      providerMode: this.getProviderMode()
    };
  }

  async getSummary(userId: string, query: unknown) {
    const input = parseWithSchema(billingSummaryQuerySchema, query);
    const workspace = await this.requireWorkspaceAccess(input.workspaceId, userId);
    const currentPlan = this.normalizeWorkspacePlan(workspace.plan);
    const usage = await this.getWorkspaceUsage(workspace.id);
    const latestSubscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId: workspace.id
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    const invoices = await this.prisma.invoice.findMany({
      where: {
        OR: [
          {
            subscription: {
              workspaceId: workspace.id
            }
          },
          {
            userId: workspace.ownerUserId
          }
        ]
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });

    return {
      currentPlan: this.serializePlan(currentPlan),
      invoices: invoices.map((invoice) => ({
        amountCents: invoice.amountCents,
        createdAt: invoice.createdAt.toISOString(),
        currency: invoice.currency,
        id: invoice.id,
        issuedAt: invoice.issuedAt?.toISOString() ?? null,
        status: invoice.status,
        stripeInvoiceId: invoice.stripeInvoiceId
      })),
      providerMode: this.getProviderMode(),
      quotas: {
        qrCodes: {
          limit: billingPlanCatalog[currentPlan].maxQrCodes,
          used: usage.qrCodesUsed
        },
        storageBytes: {
          limit: billingPlanCatalog[currentPlan].storageQuotaBytes,
          used: usage.storageBytesUsed
        }
      },
      subscription: latestSubscription
        ? {
            cancelAtPeriodEnd: latestSubscription.cancelAtPeriodEnd,
            createdAt: latestSubscription.createdAt.toISOString(),
            currentPeriodEnd: latestSubscription.currentPeriodEnd?.toISOString() ?? null,
            id: latestSubscription.id,
            plan: this.normalizeWorkspacePlan(latestSubscription.plan),
            status: latestSubscription.status.toLowerCase(),
            stripeCustomerId: latestSubscription.stripeCustomerId,
            stripeSubscriptionId: latestSubscription.stripeSubscriptionId,
            updatedAt: latestSubscription.updatedAt.toISOString()
          }
        : null,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        plan: currentPlan
      }
    };
  }

  async createCheckoutSession(userId: string, payload: unknown) {
    const input = parseWithSchema(createCheckoutSessionSchema, payload);
    const workspace = await this.requireWorkspaceAccess(input.workspaceId, userId);
    const targetPlan = input.targetPlan;
    const appBaseUrl = this.getAppBaseUrl();

    if (this.normalizeWorkspacePlan(workspace.plan) === targetPlan) {
      throw new BadRequestException(`Workspace is already on the ${billingPlanCatalog[targetPlan].name} plan.`);
    }

    const successUrl =
      assertAllowedReturnUrl(
        input.successUrl ??
          `${appBaseUrl}/dashboard/billing?checkout_session_id={CHECKOUT_SESSION_ID}`,
        appBaseUrl,
        "successUrl"
      ) ??
      `${appBaseUrl}/dashboard/billing?checkout_session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      assertAllowedReturnUrl(
        input.cancelUrl ?? `${appBaseUrl}/dashboard/billing?checkout_canceled=1`,
        appBaseUrl,
        "cancelUrl"
      ) ??
      `${appBaseUrl}/dashboard/billing?checkout_canceled=1`;
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId: workspace.id
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    this.logger.info(
      "billing.checkout_session_requested",
      {
        mode: this.getProviderMode(),
        targetPlan,
        userId,
        workspaceId: workspace.id
      },
      BillingService.name
    );

    if (this.getProviderMode() === "mock") {
      const checkoutSessionId = `cs_test_mock_${Date.now()}`;
      const subscriptionId = existingSubscription?.stripeSubscriptionId ?? `sub_test_mock_${Date.now()}`;
      const customerId = existingSubscription?.stripeCustomerId ?? `cus_test_mock_${Date.now()}`;
      const url = `${this.getAppBaseUrl()}/dashboard/billing?checkout_session_id=${checkoutSessionId}&target_plan=${targetPlan}`;

      this.telemetry.track("billing.checkout_session_created", {
        mode: "mock",
        targetPlan,
        userId,
        workspaceId: workspace.id
      });

      return {
        checkoutSessionId,
        providerMode: "mock",
        subscriptionId,
        stripeCustomerId: customerId,
        targetPlan,
        url,
        workspaceId: workspace.id
      };
    }

    const stripeClient = this.requireStripeClient();
    const session = await stripeClient.checkout.sessions.create({
      cancel_url: cancelUrl,
      client_reference_id: workspace.id,
      customer: existingSubscription?.stripeCustomerId ?? undefined,
      customer_email: existingSubscription?.stripeCustomerId
        ? undefined
        : workspace.owner.email,
      line_items: [
        {
          price: this.getPriceIdForPlan(targetPlan),
          quantity: 1
        }
      ],
      metadata: {
        targetPlan,
        userId,
        workspaceId: workspace.id
      },
      mode: "subscription",
      subscription_data: {
        metadata: {
          targetPlan,
          userId,
          workspaceId: workspace.id
        }
      },
      success_url: successUrl
    });

    if (!session.url) {
      throw new BadRequestException("Stripe checkout session did not return a redirect URL.");
    }

    this.telemetry.track("billing.checkout_session_created", {
      mode: "stripe",
      targetPlan,
      userId,
      workspaceId: workspace.id
    });

    return {
      checkoutSessionId: session.id,
      providerMode: "stripe" as const,
      subscriptionId:
        typeof session.subscription === "string" ? session.subscription : null,
      stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
      targetPlan,
      url: session.url,
      workspaceId: workspace.id
    };
  }

  async cancelSubscription(userId: string, payload: unknown) {
    const input = parseWithSchema(cancelSubscriptionSchema, payload);
    const workspace = await this.requireWorkspaceAccess(input.workspaceId, userId);
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId: workspace.id
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    if (!subscription?.stripeSubscriptionId) {
      await this.setWorkspacePlan(workspace.id, "free");

      return {
        canceled: true,
        currentPlan: "free",
        mode: this.getProviderMode(),
        scheduled: false
      };
    }

    if (this.getProviderMode() === "mock") {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: {
            id: subscription.id
          },
          data: {
            cancelAtPeriodEnd: false,
            currentPeriodEnd: new Date(),
            plan: Plan.FREE,
            status: SubscriptionStatus.CANCELED
          }
        });
        await tx.workspace.update({
          where: {
            id: workspace.id
          },
          data: {
            plan: Plan.FREE
          }
        });
      });

      this.telemetry.track("billing.subscription_canceled", {
        mode: "mock",
        workspaceId: workspace.id
      });

      return {
        canceled: true,
        currentPlan: "free",
        mode: "mock",
        scheduled: false
      };
    }

    const stripeClient = this.requireStripeClient();
    const updatedSubscription = (await stripeClient.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true
      }
    )) as unknown as Stripe.Subscription;
    const updatedCurrentPeriodEnd = (updatedSubscription as {
      current_period_end?: number | null;
    }).current_period_end;

    await this.prisma.subscription.update({
      where: {
        id: subscription.id
      },
      data: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: updatedCurrentPeriodEnd
          ? new Date(Number(updatedCurrentPeriodEnd) * 1000)
          : subscription.currentPeriodEnd
      }
    });

    this.telemetry.track("billing.subscription_canceled", {
      mode: "stripe",
      workspaceId: workspace.id
    });

    return {
      canceled: true,
      currentPlan: this.normalizeWorkspacePlan(workspace.plan),
      mode: "stripe",
      scheduled: true
    };
  }

  async handleStripeWebhook(signature: string | undefined, rawBody: Buffer | string) {
    const event = this.constructWebhookEvent(signature, rawBody);
    this.logger.info(
      "billing.webhook_received",
      {
        eventId: event.id,
        type: event.type
      },
      BillingService.name
    );

    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.handleSubscriptionEvent(
          event.data.object as Stripe.Subscription,
          event.type
        );
        break;
      case "invoice.finalized":
      case "invoice.paid":
      case "invoice.payment_failed":
        await this.handleInvoiceEvent(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.info(
          "billing.webhook_ignored",
          {
            type: event.type
          },
          BillingService.name
        );
        break;
    }

    this.logger.info(
      "billing.webhook_processed",
      {
        eventId: event.id,
        type: event.type
      },
      BillingService.name
    );

    return { received: true };
  }

  async enforceQrCreateAllowed(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        id: workspaceId
      }
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const plan = this.normalizeWorkspacePlan(workspace.plan);
    const usage = await this.getWorkspaceUsage(workspaceId);
    const maxQrCodes = billingPlanCatalog[plan].maxQrCodes;

    if (usage.qrCodesUsed >= maxQrCodes) {
      throw new ForbiddenException(
        `${billingPlanCatalog[plan].name} allows up to ${maxQrCodes} active QR codes. Upgrade to continue creating more.`
      );
    }

    return {
      plan,
      usage
    };
  }

  async applyQrSettingsForPlan(workspaceId: string, settings: QrSettingsInput) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        id: workspaceId
      }
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const plan = this.normalizeWorkspacePlan(workspace.plan);

    if (!billingPlanCatalog[plan].adsControl && settings.adsEnabled === false) {
      throw new ForbiddenException(
        "Turning off ads is available on the Premium plan only."
      );
    }

    return settings;
  }

  async enforceStorageQuota(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        id: workspaceId
      }
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const plan = this.normalizeWorkspacePlan(workspace.plan);
    const usage = await this.getWorkspaceUsage(workspaceId);
    const limit = billingPlanCatalog[plan].storageQuotaBytes;

    if (usage.storageBytesUsed > limit) {
      throw new ForbiddenException(
        `${billingPlanCatalog[plan].name} includes up to ${this.formatBytes(limit)} of QR asset storage. Remove old codes or upgrade before generating more assets.`
      );
    }

    return {
      limit,
      plan,
      usage
    };
  }

  createMockWebhookHeader(payload: string | Buffer, timestamp = Math.floor(Date.now() / 1000)) {
    const body = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload;
    const signedPayload = `${timestamp}.${body}`;
    const digest = createHmac("sha256", this.getWebhookSecret())
      .update(signedPayload)
      .digest("hex");

    return `t=${timestamp},v1=${digest}`;
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const workspaceId = session.metadata?.workspaceId ?? session.client_reference_id ?? null;
    const targetPlan = this.normalizePlanCode(session.metadata?.targetPlan);

    if (!workspaceId || !targetPlan) {
      return;
    }

    const existingSubscription = session.subscription
      ? await this.prisma.subscription.findFirst({
          where: {
            stripeSubscriptionId:
              typeof session.subscription === "string"
                ? session.subscription
                : session.subscription.id
          }
        })
      : null;

    if (existingSubscription) {
      await this.prisma.subscription.update({
        where: {
          id: existingSubscription.id
        },
        data: {
          plan: this.toDbPlan(targetPlan),
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : existingSubscription.stripeCustomerId,
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : existingSubscription.stripeSubscriptionId
        }
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          plan: this.toDbPlan(targetPlan),
          status: SubscriptionStatus.INCOMPLETE,
          stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === "string" ? session.subscription : null,
          userId: session.metadata?.userId ?? null,
          workspaceId
        }
      });
    }

    this.telemetry.track("billing.checkout_completed", {
      targetPlan,
      workspaceId
    });
  }

  private async handleSubscriptionEvent(
    subscription: Stripe.Subscription,
    eventType: string
  ) {
    const targetPlan =
      this.normalizePlanCode(subscription.metadata?.targetPlan) ??
      this.planFromPriceItems(subscription.items.data) ??
      null;
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        stripeSubscriptionId: subscription.id
      }
    });
    const workspaceId =
      subscription.metadata?.workspaceId ??
      existingSubscription?.workspaceId ??
      null;

    if (!workspaceId || !targetPlan) {
      return;
    }

    const status = this.mapStripeSubscriptionStatus(subscription.status);
    const currentPeriodEnd =
      "current_period_end" in subscription && subscription.current_period_end
        ? new Date(Number(subscription.current_period_end) * 1000)
        : null;

    if (existingSubscription) {
      await this.prisma.subscription.update({
        where: {
          id: existingSubscription.id
        },
        data: {
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
          currentPeriodEnd,
          plan: this.toDbPlan(targetPlan),
          status,
          stripeCustomerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : existingSubscription.stripeCustomerId,
          userId: subscription.metadata?.userId ?? existingSubscription.userId,
          workspaceId
        }
      });
    } else {
      await this.prisma.subscription.create({
        data: {
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
          currentPeriodEnd,
          plan: this.toDbPlan(targetPlan),
          status,
          stripeCustomerId:
            typeof subscription.customer === "string" ? subscription.customer : null,
          stripeSubscriptionId: subscription.id,
          userId: subscription.metadata?.userId ?? null,
          workspaceId
        }
      });
    }

    if (
      status === SubscriptionStatus.ACTIVE ||
      status === SubscriptionStatus.TRIALING ||
      status === SubscriptionStatus.PAST_DUE
    ) {
      await this.setWorkspacePlan(workspaceId, targetPlan);
    } else if (eventType === "customer.subscription.deleted") {
      await this.setWorkspacePlan(workspaceId, "free");
    }

    this.telemetry.track("billing.subscription_synced", {
      status,
      targetPlan,
      workspaceId
    });
  }

  private async handleInvoiceEvent(invoice: Stripe.Invoice) {
    const stripeSubscriptionId = this.getInvoiceSubscriptionId(invoice);
    const subscription = stripeSubscriptionId
      ? await this.prisma.subscription.findFirst({
          where: {
            stripeSubscriptionId
          }
        })
      : null;

    await this.prisma.invoice.upsert({
      where: {
        stripeInvoiceId: invoice.id
      },
      update: {
        amountCents:
          typeof invoice.amount_due === "number"
            ? invoice.amount_due
            : typeof invoice.amount_paid === "number"
              ? invoice.amount_paid
              : null,
        currency: invoice.currency ?? null,
        issuedAt: invoice.created ? new Date(invoice.created * 1000) : null,
        status: invoice.status ?? null,
        subscriptionId: subscription?.id ?? null,
        userId: subscription?.userId ?? null
      },
      create: {
        amountCents:
          typeof invoice.amount_due === "number"
            ? invoice.amount_due
            : typeof invoice.amount_paid === "number"
              ? invoice.amount_paid
              : null,
        currency: invoice.currency ?? null,
        issuedAt: invoice.created ? new Date(invoice.created * 1000) : null,
        status: invoice.status ?? null,
        stripeInvoiceId: invoice.id,
        subscriptionId: subscription?.id ?? null,
        userId: subscription?.userId ?? null
      }
    });

    this.telemetry.track("billing.invoice_synced", {
      invoiceId: invoice.id,
      subscriptionId: stripeSubscriptionId
    });
  }

  private serializePlan(code: PlanName) {
    const plan = billingPlanCatalog[code];
    const priceId = code === "free" || code === "enterprise" ? null : this.getPriceIdForPlan(code);

    return {
      analyticsRetentionDays: plan.analyticsRetentionDays,
      apiAccess: plan.apiAccess,
      code,
      displayName: plan.name,
      features: {
        adsControl: plan.adsControl,
        apiAccess: plan.apiAccess,
        invoiceHistory: plan.invoiceHistory,
        prioritySupport: plan.supportsPrioritySupport,
        whiteLabel: plan.supportsWhiteLabel
      },
      limits: {
        maxQrCodes: plan.maxQrCodes,
        storageQuotaBytes: plan.storageQuotaBytes
      },
      monthlyPriceCents: plan.monthlyPriceCents,
      priceId,
      summary: plan.summary,
      targetAudience: plan.targetAudience
    };
  }

  private async getWorkspaceUsage(workspaceId: string) {
    const [qrCodesUsed, storageAggregate] = await this.prisma.$transaction([
      this.prisma.qRCode.count({
        where: {
          deletedAt: null,
          workspaceId
        }
      }),
      this.prisma.qRAsset.aggregate({
        where: {
          workspaceId,
          qrCode: {
            deletedAt: null
          }
        },
        _sum: {
          bytes: true
        }
      })
    ]);

    return {
      qrCodesUsed,
      storageBytesUsed: Number(storageAggregate._sum.bytes ?? BigInt(0))
    };
  }

  private async requireWorkspaceAccess(
    workspaceId: string | undefined,
    userId: string
  ) {
    const fallbackWorkspaceId = workspaceId ?? (await this.getDefaultWorkspaceId(userId));

    if (!fallbackWorkspaceId) {
      throw new NotFoundException("No workspace is available for billing.");
    }

    const workspace = await this.prisma.workspace.findFirst({
      where: {
        id: fallbackWorkspaceId,
        OR: [
          {
            ownerUserId: userId
          },
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
        owner: true
      }
    });

    if (!workspace) {
      throw new ForbiddenException("Workspace is not accessible.");
    }

    return workspace;
  }

  private async getDefaultWorkspaceId(userId: string) {
    const ownedWorkspace = await this.prisma.workspace.findFirst({
      where: {
        ownerUserId: userId
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        id: true
      }
    });

    if (ownedWorkspace) {
      return ownedWorkspace.id;
    }

    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        workspaceId: true
      }
    });

    return membership?.workspaceId ?? null;
  }

  private createStripeClient() {
    if (this.getProviderMode() !== "stripe") {
      return null;
    }

    return new Stripe(this.getStripeSecretKey(), {
      apiVersion: "2025-08-27.basil"
    });
  }

  private requireStripeClient() {
    if (!this.stripeClient) {
      throw new BadRequestException("Stripe checkout is not configured for this environment.");
    }

    return this.stripeClient;
  }

  private constructWebhookEvent(signature: string | undefined, rawBody: Buffer | string) {
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

    try {
      if (this.getProviderMode() === "mock") {
        this.verifyMockWebhookSignature(signature, bodyBuffer);

        try {
          return JSON.parse(bodyBuffer.toString("utf8")) as Stripe.Event;
        } catch {
          throw new BadRequestException("Stripe webhook payload is invalid JSON.");
        }
      }

      return this.requireStripeClient().webhooks.constructEvent(
        bodyBuffer,
        signature ?? "",
        this.getWebhookSecret()
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.warn(
        "billing.webhook_signature_invalid",
        {
          reason: error instanceof Error ? error.message : String(error)
        },
        BillingService.name
      );
      throw new ForbiddenException("Stripe signature verification failed.");
    }
  }

  private verifyMockWebhookSignature(signature: string | undefined, rawBody: Buffer) {
    if (!signature) {
      throw new ForbiddenException("Stripe signature header is missing.");
    }

    const timestampMatch = signature.match(/t=(\d+)/);
    const digestMatch = signature.match(/v1=([a-f0-9]+)/i);

    if (!timestampMatch || !digestMatch) {
      throw new ForbiddenException("Stripe signature header is invalid.");
    }

    const timestamp = Number(timestampMatch[1]);
    const providedDigest = digestMatch[1] ?? "";
    const candidateBodies = [rawBody];
    const normalizedBody = this.normalizeMockWebhookBody(rawBody);

    if (normalizedBody) {
      candidateBodies.push(Buffer.from(normalizedBody, "utf8"));
    }

    const signatureMatches = candidateBodies.some((candidateBody) => {
      const expectedSignature = this.createMockWebhookHeader(candidateBody, timestamp);
      const expectedDigest = expectedSignature.match(/v1=([a-f0-9]+)/i)?.[1] ?? "";

      return (
        expectedDigest.length === providedDigest.length &&
        timingSafeEqual(Buffer.from(expectedDigest), Buffer.from(providedDigest))
      );
    });

    if (!signatureMatches) {
      throw new ForbiddenException("Stripe signature verification failed.");
    }
  }

  private normalizeMockWebhookBody(rawBody: Buffer) {
    try {
      return JSON.stringify(JSON.parse(rawBody.toString("utf8")));
    } catch {
      return null;
    }
  }

  private normalizeWorkspacePlan(plan: Plan | string): PlanName {
    const normalized = String(plan).trim().toLowerCase();

    if (!(normalized in billingPlanCatalog)) {
      return "free";
    }

    return normalized as PlanName;
  }

  private normalizePlanCode(value: string | undefined | null) {
    if (!value) {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized in billingPlanCatalog ? (normalized as PlanName) : null;
  }

  private toDbPlan(plan: PlanName) {
    return plan.toUpperCase() as Plan;
  }

  private planFromPriceItems(items: Array<Stripe.SubscriptionItem>) {
    const paidPlan = items.find((item) => {
      const priceId = item.price?.id;
      return (
        priceId === process.env.STRIPE_PRICE_LITE ||
        priceId === process.env.STRIPE_PRICE_PREMIUM
      );
    })?.price?.id;

    if (paidPlan === process.env.STRIPE_PRICE_LITE) {
      return "lite";
    }

    if (paidPlan === process.env.STRIPE_PRICE_PREMIUM) {
      return "premium";
    }

    return null;
  }

  private mapStripeSubscriptionStatus(status: Stripe.Subscription.Status) {
    switch (status) {
      case "active":
        return SubscriptionStatus.ACTIVE;
      case "trialing":
        return SubscriptionStatus.TRIALING;
      case "past_due":
        return SubscriptionStatus.PAST_DUE;
      case "unpaid":
        return SubscriptionStatus.UNPAID;
      case "canceled":
        return SubscriptionStatus.CANCELED;
      case "incomplete":
      case "incomplete_expired":
      case "paused":
      default:
        return SubscriptionStatus.INCOMPLETE;
    }
  }

  private getProviderMode(): StripeProviderMode {
    const secretKey = this.getStripeSecretKey();
    return secretKey === "sk_test_mock" ? "mock" : "stripe";
  }

  private getStripeSecretKey() {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    return secretKey && secretKey !== "replace-me" ? secretKey : "sk_test_mock";
  }

  private getWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET?.trim() || "whsec_mock";
  }

  private getPriceIdForPlan(plan: PlanName) {
    if (plan === "lite") {
      return process.env.STRIPE_PRICE_LITE?.trim() || "price_lite_test";
    }

    if (plan === "premium") {
      return process.env.STRIPE_PRICE_PREMIUM?.trim() || "price_premium_test";
    }

    throw new BadRequestException(`No Stripe price is configured for the ${plan} plan.`);
  }

  private getAppBaseUrl() {
    return (
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.APP_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
  }

  private async setWorkspacePlan(workspaceId: string, plan: PlanName) {
    await this.prisma.workspace.update({
      where: {
        id: workspaceId
      },
      data: {
        plan: this.toDbPlan(plan)
      }
    });
  }

  private formatBytes(value: number) {
    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  private getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
    const withLegacySubscription = invoice as Stripe.Invoice & {
      subscription?: string | null;
      parent?: {
        subscription_details?: {
          subscription?: string | null;
        };
      } | null;
    };

    if (typeof withLegacySubscription.subscription === "string") {
      return withLegacySubscription.subscription;
    }

    if (
      withLegacySubscription.parent?.subscription_details?.subscription &&
      typeof withLegacySubscription.parent.subscription_details.subscription === "string"
    ) {
      return withLegacySubscription.parent.subscription_details.subscription;
    }

    return null;
  }
}
