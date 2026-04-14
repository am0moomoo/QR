import { RequestMethod, ValidationPipe, type INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import type { AuthenticatedRequest } from "./common/authenticated-request";
import { StructuredLoggerService } from "./common/structured-logger.service";

export function configureApiApp(app: INestApplication) {
  const logger = app.get(StructuredLoggerService);

  app.enableCors();
  app.use((request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const incomingRequestId = request.header("x-request-id")?.trim();
    const requestId = incomingRequestId || randomUUID();

    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    response.on("finish", () => {
      logger.info(
        "http.request_completed",
        {
          durationMs: Date.now() - startedAt,
          method: request.method,
          path: request.originalUrl ?? request.url,
          requestId,
          statusCode: response.statusCode,
          userId: request.currentUser?.id ?? null
        },
        "HTTP"
      );
    });
    next();
  });

  app.setGlobalPrefix("api/v1", {
    exclude: [
      { method: RequestMethod.GET, path: "r/:slug" },
      { method: RequestMethod.POST, path: "r/:slug/password" },
      { method: RequestMethod.GET, path: "inactive" },
      { method: RequestMethod.GET, path: "landing/:slug" }
    ]
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );

  app.useGlobalFilters(new ApiExceptionFilter(logger));

  return app;
}
