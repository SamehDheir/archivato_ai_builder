import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

/**
 * Global catch-all exception filter. It preserves the (already validated /
 * sanitized) body of known `HttpException`s so client-facing errors are
 * unchanged, but for unexpected errors it returns a generic 500 — never leaking
 * a stack trace or internal message. Server errors (>= 500) are logged with
 * request context and forwarded to Sentry (a no-op unless `SENTRY_DSN` was set,
 * so this is safe with or without monitoring configured).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      const err =
        exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${status}: ${err.message}`,
        err.stack,
      );
      // No-op when Sentry.init hasn't run (SENTRY_DSN unset).
      Sentry.captureException(err);
    }

    const body = isHttp
      ? exception.getResponse()
      : { statusCode: status, message: 'Internal server error' };

    res
      .status(status)
      .json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
  }
}
