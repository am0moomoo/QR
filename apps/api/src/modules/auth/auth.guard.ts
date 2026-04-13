import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../../common/authenticated-request";
import { AuthService } from "./auth.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = header.slice("Bearer ".length).trim();

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const session = await this.authService.resolveSession(token);

    if (!session) {
      throw new UnauthorizedException("Session is invalid or expired");
    }

    request.currentSession = {
      id: session.id,
      expiresAt: session.expiresAt.toISOString()
    };
    request.currentUser = this.authService.serializeUser(session.user);

    return true;
  }
}
