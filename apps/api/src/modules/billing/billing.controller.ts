import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthGuard } from "../auth/auth.guard";
import { BillingService } from "./billing.service";

@ApiTags("billing")
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("plans")
  listPlans() {
    return this.billingService.listPlans();
  }

  @Get("summary")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  getSummary(
    @CurrentUser() user: { id: string },
    @Query() query: Record<string, string | string[] | undefined>
  ) {
    return this.billingService.getSummary(user.id, query);
  }

  @Post("checkout-session")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  createCheckoutSession(
    @CurrentUser() user: { id: string },
    @Body() body: unknown
  ) {
    return this.billingService.createCheckoutSession(user.id, body);
  }

  @Post("cancel-subscription")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @HttpCode(200)
  cancelSubscription(
    @CurrentUser() user: { id: string },
    @Body() body: unknown
  ) {
    return this.billingService.cancelSubscription(user.id, body);
  }

  @Post("webhooks/stripe")
  @HttpCode(200)
  handleStripeWebhook(
    @Headers("stripe-signature") signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
    @Body() body: unknown
  ) {
    return this.billingService.handleStripeWebhook(
      signature,
      request.rawBody ?? JSON.stringify(body)
    );
  }
}
