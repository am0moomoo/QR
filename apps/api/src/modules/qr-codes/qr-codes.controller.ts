import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthGuard } from "../auth/auth.guard";
import { QrCodesService } from "./qr-codes.service";

@ApiTags("QR Codes")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("qr-codes")
export class QrCodesController {
  constructor(private readonly qrCodesService: QrCodesService) {}

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query() query: Record<string, string | string[] | undefined>
  ) {
    return this.qrCodesService.list(user.id, query);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.qrCodesService.create(user.id, body);
  }

  @Get(":id")
  getOne(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.qrCodesService.getOne(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.qrCodesService.update(user.id, id, body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.qrCodesService.remove(user.id, id);
  }

  @Get(":id/downloads")
  async listDownloads(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Query("format") format: string | undefined,
    @Res() response: Response
  ) {
    if (!format) {
      return response.json(await this.qrCodesService.listDownloads(user.id, id));
    }

    const download = await this.qrCodesService.download(user.id, id, format);

    if (download.kind === "redirect") {
      return response.redirect(302, download.redirectUrl);
    }

    response.setHeader("Content-Length", download.contentLength.toString());
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${download.fileName}"`
    );
    return response.type(download.contentType).send(download.body);
  }

  @Post(":id/render")
  @HttpCode(200)
  render(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.qrCodesService.render(user.id, id);
  }

  @Post(":id/activate")
  @HttpCode(200)
  activate(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.qrCodesService.changeStatus(user.id, id, "ACTIVE");
  }

  @Post(":id/deactivate")
  @HttpCode(200)
  deactivate(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.qrCodesService.changeStatus(user.id, id, "INACTIVE");
  }

  @Post(":id/archive")
  @HttpCode(200)
  archive(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.qrCodesService.changeStatus(user.id, id, "ARCHIVED");
  }

  @Post(":id/duplicate")
  duplicate(@CurrentUser() user: { id: string }, @Param("id") id: string) {
    return this.qrCodesService.duplicate(user.id, id);
  }

  @Get(":id/analytics")
  analytics(
    @CurrentUser() user: { id: string },
    @Param("id") id: string,
    @Query() query: Record<string, string | string[] | undefined>
  ) {
    return this.qrCodesService.getAnalytics(user.id, id, query);
  }
}
