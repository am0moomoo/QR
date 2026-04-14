import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../../common/authenticated-request";
import { StructuredLoggerService } from "../../common/structured-logger.service";
import { ScanService } from "./scan.service";

@ApiTags("Public")
@Controller()
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly logger: StructuredLoggerService
  ) {}

  @Get(["public/r/:slug", "r/:slug"])
  async resolve(
    @Param("slug") slug: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    try {
      const result = await this.scanService.resolve(slug, request);

      if (result.kind === "redirect") {
        return response.redirect(302, result.destination);
      }

      if (result.kind === "inactive") {
        return response
          .status(410)
          .type("html")
          .send(this.scanService.renderInactiveHtml());
      }

      if (result.kind === "password_required") {
        return response
          .status(200)
          .type("html")
          .send(this.scanService.renderPasswordHtml(slug, undefined, this.getRequestId(request)));
      }

      if (result.kind === "rate_limited") {
        response.setHeader("Retry-After", result.retryAfterSeconds.toString());
        return response
          .status(429)
          .type("html")
          .send(this.scanService.renderRateLimitedHtml(result.retryAfterSeconds));
      }

      return response.status(200).type("html").send(this.scanService.renderLandingHtml(result));
    } catch (error) {
      if (error instanceof NotFoundException) {
        return response
          .status(404)
          .type("html")
          .send(this.scanService.renderNotFoundHtml(this.getRequestId(request)));
      }

      this.logger.error(
        "scan.public_render_failed",
        error,
        {
          requestId: this.getRequestId(request),
          slug
        },
        ScanController.name
      );
      return response
        .status(500)
        .type("html")
        .send(this.scanService.renderUnexpectedHtml(this.getRequestId(request)));
    }
  }

  @Post(["public/r/:slug/password", "r/:slug/password"])
  @HttpCode(200)
  async submitPassword(
    @Param("slug") slug: string,
    @Req() request: Request,
    @Body() body: { password?: string },
    @Res() response: Response
  ) {
    try {
      const result = await this.scanService.resolve(slug, request, body?.password);

      if (result.kind === "redirect") {
        return response.redirect(302, result.destination);
      }

      if (result.kind === "inactive") {
        return response
          .status(410)
          .type("html")
          .send(this.scanService.renderInactiveHtml());
      }

      if (result.kind === "password_required") {
        return response
          .status(200)
          .type("html")
          .send(this.scanService.renderPasswordHtml(slug, undefined, this.getRequestId(request)));
      }

      if (result.kind === "rate_limited") {
        response.setHeader("Retry-After", result.retryAfterSeconds.toString());
        return response
          .status(429)
          .type("html")
          .send(this.scanService.renderRateLimitedHtml(result.retryAfterSeconds));
      }

      return response.status(200).type("html").send(this.scanService.renderLandingHtml(result));
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return response
          .status(401)
          .type("html")
          .send(this.scanService.renderPasswordHtml(slug, "Incorrect password", this.getRequestId(request)));
      }

      if (error instanceof NotFoundException) {
        return response
          .status(404)
          .type("html")
          .send(this.scanService.renderNotFoundHtml(this.getRequestId(request)));
      }

      this.logger.error(
        "scan.public_password_failed",
        error,
        {
          requestId: this.getRequestId(request),
          slug
        },
        ScanController.name
      );
      return response
        .status(500)
        .type("html")
        .send(this.scanService.renderUnexpectedHtml(this.getRequestId(request)));
    }
  }

  @Get(["public/inactive", "inactive"])
  inactive(@Res() response: Response) {
    return response.status(410).type("html").send(this.scanService.renderInactiveHtml());
  }

  @Get(["public/landing/:slug", "landing/:slug"])
  async landing(
    @Param("slug") slug: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    try {
      const result = await this.scanService.renderLandingPage(slug, request);

      if (result.kind === "inactive") {
        return response.status(410).type("html").send(this.scanService.renderInactiveHtml());
      }

      if (result.kind === "password_required") {
        return response
          .status(200)
          .type("html")
          .send(this.scanService.renderPasswordHtml(slug, undefined, this.getRequestId(request)));
      }

      if (result.kind === "rate_limited") {
        response.setHeader("Retry-After", result.retryAfterSeconds.toString());
        return response
          .status(429)
          .type("html")
          .send(this.scanService.renderRateLimitedHtml(result.retryAfterSeconds));
      }

      return response.status(200).type("html").send(this.scanService.renderLandingHtml(result));
    } catch (error) {
      if (error instanceof NotFoundException) {
        return response
          .status(404)
          .type("html")
          .send(this.scanService.renderNotFoundHtml(this.getRequestId(request)));
      }

      this.logger.error(
        "scan.public_landing_failed",
        error,
        {
          requestId: this.getRequestId(request),
          slug
        },
        ScanController.name
      );
      return response
        .status(500)
        .type("html")
        .send(this.scanService.renderUnexpectedHtml(this.getRequestId(request)));
    }
  }

  private getRequestId(request: Request) {
    const typedRequest = request as AuthenticatedRequest;

    if (typedRequest.requestId) {
      return typedRequest.requestId;
    }

    const requestId = request.headers["x-request-id"];
    return Array.isArray(requestId) ? requestId[0] : requestId;
  }
}
