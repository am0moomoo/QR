import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "./authenticated-request";
import { StructuredLoggerService } from "./structured-logger.service";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<AuthenticatedRequest>();
    const response = context.getResponse<Response>();
    const requestId = request.requestId ?? "unknown";
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = this.buildResponseBody(exception, statusCode, requestId);
    const logContext = {
      method: request.method,
      path: request.originalUrl ?? request.url,
      requestId,
      statusCode,
      userId: request.currentUser?.id ?? null
    };

    if (statusCode >= 500) {
      this.logger.error("http.request_failed", exception, logContext, ApiExceptionFilter.name);
    } else {
      this.logger.warn(
        "http.request_rejected",
        {
          ...logContext,
          message: responseBody.message
        },
        ApiExceptionFilter.name
      );
    }

    response.setHeader("X-Request-Id", requestId);
    response.status(statusCode).json(responseBody);
  }

  private buildResponseBody(
    exception: unknown,
    statusCode: number,
    requestId: string
  ) {
    const message =
      statusCode >= 500
        ? "Something went wrong while processing the request. Try again in a moment."
        : this.resolveMessage(exception, statusCode);

    return {
      code: this.resolveCode(statusCode),
      message,
      requestId,
      statusCode
    };
  }

  private resolveMessage(exception: unknown, statusCode: number) {
    if (!(exception instanceof HttpException)) {
      return "Request failed.";
    }

    const response = exception.getResponse();

    if (typeof response === "string" && response.trim()) {
      return response;
    }

    if (typeof response === "object" && response !== null) {
      const message = (response as { message?: string | string[] }).message;

      if (Array.isArray(message) && message.length > 0) {
        return message.join(", ");
      }

      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }

    return exception.message || this.resolveCode(statusCode);
  }

  private resolveCode(statusCode: number) {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "RATE_LIMITED";
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "VALIDATION_ERROR";
      default:
        return "INTERNAL_SERVER_ERROR";
    }
  }
}
