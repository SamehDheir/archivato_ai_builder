import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { tap } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import type { AuthUser } from '@archivato/shared';
import { AnalyticsService } from '../analytics/analytics.service';

/**
 * Records the funnel's final step — the owner actually handing the work off.
 *
 * An interceptor rather than nine `recordSafe` calls, for the same reason
 * `UsageTrackingLlmProvider` is a decorator rather than an edit per provider:
 * there is exactly one place that turns an export into a row, and a tenth format
 * is measured the day it is added instead of the day someone remembers.
 *
 * Two rules it enforces that a per-route call would have to repeat:
 *
 *   - **The mock server is not an export.** `@All(':sessionId/mock/*')` lives on
 *     this controller but serves "Try it out" in the API docs — a single session
 *     of clicking around it would fire dozens of times and drown the real signal.
 *   - **Only a success counts.** `tap`'s next handler does not run on error, so a
 *     402 from `ProGuard` or a 409 from an incomplete pipeline records nothing —
 *     a free user bouncing off the wall did not export (the `JobsController`
 *     rule, which records only after `assertPro` passes).
 */
@Injectable()
export class ExportAnalyticsInterceptor implements NestInterceptor {
  constructor(private readonly analytics: AnalyticsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const sessionId = (req.params as Record<string, string>)?.sessionId;
    const user = (req as Request & { user?: AuthUser }).user;

    if (isMockRequest(req)) return next.handle();

    return next.handle().pipe(
      tap(() => {
        if (!user) return;
        void this.analytics.recordSafe({
          type: 'export',
          userId: user.id,
          // `format` is the route's own last segment, so it stays accurate as
          // formats are added; `sessionId` is what lets the funnel count deals
          // rather than clicks.
          meta: { sessionId, format: exportFormat(req) },
        });
      }),
    );
  }
}

/** Is this the API-docs mock server rather than a real export? */
function isMockRequest(req: Request): boolean {
  return /\/mock(\/|$)/.test(req.path);
}

/** The route's trailing segment (`json`, `all.zip`, `schema.sql`, …). */
function exportFormat(req: Request): string {
  const last = req.path.split('?')[0].split('/').filter(Boolean).pop();
  return last ?? 'unknown';
}
