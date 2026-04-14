import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthGuard } from "../auth/auth.guard";
import {
  CreateCustomDomainDto,
  CreateFolderDto,
  CreateWorkspaceDto,
  ImportQrCodesDto,
  VerifyCustomDomainDto
} from "./workspaces.dto";
import { WorkspacesService } from "./workspaces.service";

@ApiTags("Workspaces")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.workspacesService.list(user.id);
  }

  @Post()
  @ApiBody({ type: CreateWorkspaceDto })
  createWorkspace(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.workspacesService.createWorkspace(user.id, body);
  }

  @Get(":workspaceId/folders")
  listFolders(
    @CurrentUser() user: { id: string },
    @Param("workspaceId") workspaceId: string
  ) {
    return this.workspacesService.listFolders(user.id, workspaceId);
  }

  @Post(":workspaceId/folders")
  @ApiBody({ type: CreateFolderDto })
  createFolder(
    @CurrentUser() user: { id: string },
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown
  ) {
    return this.workspacesService.createFolder(user.id, workspaceId, body);
  }

  @Get(":workspaceId/custom-domains")
  listCustomDomains(
    @CurrentUser() user: { id: string },
    @Param("workspaceId") workspaceId: string
  ) {
    return this.workspacesService.listCustomDomains(user.id, workspaceId);
  }

  @Post(":workspaceId/custom-domains")
  @ApiBody({ type: CreateCustomDomainDto })
  createCustomDomain(
    @CurrentUser() user: { id: string },
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown
  ) {
    return this.workspacesService.createCustomDomain(user.id, workspaceId, body);
  }

  @Post(":workspaceId/custom-domains/:domainId/verify")
  @ApiBody({ type: VerifyCustomDomainDto })
  verifyCustomDomain(
    @CurrentUser() user: { id: string },
    @Param("workspaceId") workspaceId: string,
    @Param("domainId") domainId: string,
    @Body() body: unknown
  ) {
    return this.workspacesService.verifyCustomDomain(
      user.id,
      workspaceId,
      domainId,
      body
    );
  }

  @Delete(":workspaceId/custom-domains/:domainId")
  deleteCustomDomain(
    @CurrentUser() user: { id: string },
    @Param("workspaceId") workspaceId: string,
    @Param("domainId") domainId: string
  ) {
    return this.workspacesService.deleteCustomDomain(user.id, workspaceId, domainId);
  }

  @Get(":workspaceId/qr-codes/export")
  async exportQrCodes(
    @CurrentUser() user: { id: string },
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | string[] | undefined>,
    @Res() response: Response
  ) {
    const exported = await this.workspacesService.exportQrCodes(
      user.id,
      workspaceId,
      query
    );

    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${exported.fileName}"`
    );
    return response.type(exported.contentType).send(exported.body);
  }

  @Post(":workspaceId/qr-codes/import")
  @ApiBody({ type: ImportQrCodesDto })
  importQrCodes(
    @CurrentUser() user: { id: string },
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown
  ) {
    return this.workspacesService.importQrCodes(user.id, workspaceId, body);
  }
}
