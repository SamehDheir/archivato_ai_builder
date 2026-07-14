import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, type Subscription } from 'rxjs';
import { normalizeUsageStage, type AuthUser } from '@archivato/shared';
import {
  runWithLlmContext,
  type LlmCallContext,
} from '../llm/usage/llm-usage.context';

/** The Express request fields we read (populated by routing + `JwtAuthGuard`). */
interface RequestLike {
  user?: AuthUser;
  params?: Record<string, string>;
  path?: string;
  url?: string;
}

/**
 * Attaches the "who is this LLM call for" context to every HTTP request, so the
 * usage meter can attribute tokens to a user / session / stage without any of the
 * 14 agents or a dozen stage services having to pass it down.
 *
 * Registered globally (`APP_INTERCEPTOR`): a request that never touches an LLM
 * simply establishes a context nobody reads. The BullMQ worker has no request, so
 * it establishes its own context in `PipelineProcessor`.
 */
@Injectable()
export class LlmContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<RequestLike>();
    const llmContext: LlmCallContext = {
      userId: req.user?.id ?? null,
      sessionId: req.params?.sessionId ?? null,
      // `/jobs/:sessionId/:stage` and `/stream/:sessionId/:stage` name the stage
      // explicitly; every other route is named by its first path segment.
      stage: normalizeUsageStage(req.params?.stage ?? routeSegment(req)),
    };

    // `next.handle()` DEFERS the route handler until subscription, so wrapping the
    // call alone would run the handler outside the store. Subscribe inside it.
    return new Observable((subscriber) => {
      let sub: Subscription | undefined;
      runWithLlmContext(llmContext, () => {
        sub = next.handle().subscribe(subscriber);
      });
      return () => sub?.unsubscribe();
    });
  }
}

/**
 * The first path segment after the global `/api` prefix — `system-design`,
 * `support`, `chat`, … Health probes and anything unrecognized normalize to
 * `other`.
 */
function routeSegment(req: RequestLike): string | undefined {
  const path = (req.path ?? req.url ?? '').split('?')[0];
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();
  return parts[0];
}
