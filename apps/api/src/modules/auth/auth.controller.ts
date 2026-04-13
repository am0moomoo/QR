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
  register(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post("auth/login")
  @HttpCode(200)
  login(@Body() body: unknown) {
    return this.authService.login(body);
  }

  @Post("auth/logout")
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  logout(
    @CurrentSession() session: { id: string }
  ) {
    return this.authService.logout(session.id);
  }

  @Post("auth/forgot-password")
  @HttpCode(200)
  forgotPassword(@Body() body: unknown) {
    return this.authService.forgotPassword(body);
  }

  @Post("auth/reset-password")
  @HttpCode(200)
  resetPassword(@Body() body: unknown) {
    return this.authService.resetPassword(body);
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
  updateProfile(
    @CurrentUser() user: { id: string },
    @Body() body: unknown
  ) {
    return this.authService.updateProfile(user.id, body);
  }
}
