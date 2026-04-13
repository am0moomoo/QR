import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../common/authenticated-request";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.currentUser;
  }
);

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.currentSession;
  }
);
