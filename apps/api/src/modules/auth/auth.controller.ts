import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentSession, CurrentUser } from "./current-user.decorator";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@ApiTags("Auth")
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("auth/register")
  async register(@Body() body: unknown) {
    return await this.authService.register(body);
  }

  @Post("auth/login")
  @HttpCode(200)
  async login(@Body() body: unknown) {
    return await this.authService.login(body);
  }

  @Post("auth/logout")
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async logout(@CurrentSession() session: { id: string }) {
    return await this.authService.logout(session.id);
  }

  @Post("auth/forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown) {
    return await this.authService.forgotPassword(body);
  }

  @Post("auth/reset-password")
  @HttpCode(200)
  async resetPassword(@Body() body: unknown) {
    return await this.authService.resetPassword(body);
  }

  @Get("me")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: unknown) {
    return user;
  }

  @Patch("me")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() body: unknown
  ) {
    return await this.authService.updateProfile(user.id, body);
  }
}