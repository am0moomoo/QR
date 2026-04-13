import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ScanService } from "./scan.service";

@ApiTags("Public")
@Controller()
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Get(["public/r/:slug", "r/:slug"])
  async resolve(
    @Param("slug") slug: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
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
        .send(this.scanService.renderPasswordHtml(slug));
    }

    if (result.kind === "rate_limited") {
      response.setHeader("Retry-After", result.retryAfterSeconds.toString());
      return response
        .status(429)
        .type("html")
        .send(this.scanService.renderRateLimitedHtml(result.retryAfterSeconds));
    }

    return response.status(200).type("html").send(this.scanService.renderLandingHtml(result));
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
          .send(this.scanService.renderPasswordHtml(slug));
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
          .send(this.scanService.renderPasswordHtml(slug, "Incorrect password"));
      }

      throw error;
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
    const result = await this.scanService.renderLandingPage(slug, request);

    if (result.kind === "inactive") {
      return response.status(410).type("html").send(this.scanService.renderInactiveHtml());
    }

    if (result.kind === "password_required") {
      return response
        .status(200)
        .type("html")
        .send(this.scanService.renderPasswordHtml(slug));
    }

    if (result.kind === "rate_limited") {
      response.setHeader("Retry-After", result.retryAfterSeconds.toString());
      return response
        .status(429)
        .type("html")
        .send(this.scanService.renderRateLimitedHtml(result.retryAfterSeconds));
    }

    return response.status(200).type("html").send(this.scanService.renderLandingHtml(result));
  }
}
