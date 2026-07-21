import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, type Subscription } from 'rxjs';
import {
  DEFAULT_ARTIFACT_LANGUAGE,
  normalizeUsageStage,
  type ArtifactLanguage,
  type AuthUser,
} from '@archivato/shared';
import {
  lazyArtifactLanguage,
  runWithLlmContext,
  type LlmCallContext,
} from '../llm/usage/llm-usage.context';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { resolveArtifactLanguage } from '../interview/interview-session.entity';

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
  constructor(
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
  ) {}

  /**
   * The artifact language of a session, or the default if it cannot be read.
   *
   * A `:id` param that is not a session at all (a ticket, a user) simply misses
   * and reads as the default — which is why this must never throw: the
   * interceptor is global, and a lookup failure here would break routes that
   * have nothing to do with generation.
   */
  private async languageOf(sessionId: string): Promise<ArtifactLanguage> {
    const session = await this.sessions.findById(sessionId);
    return session
      ? resolveArtifactLanguage(session)
      : DEFAULT_ARTIFACT_LANGUAGE;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<RequestLike>();
    const sessionId = req.params?.sessionId ?? req.params?.id ?? null;
    const llmContext: LlmCallContext = {
      userId: req.user?.id ?? null,
      sessionId: req.params?.sessionId ?? null,
      // `/jobs/:sessionId/:stage` and `/stream/:sessionId/:stage` name the stage
      // explicitly; every other route is named by its first path segment.
      stage: normalizeUsageStage(req.params?.stage ?? routeSegment(req)),
      // Lazy on purpose: this interceptor is global, so eagerly reading the
      // session would add a query to every request that merely *mentions* a
      // session id — polling the interview state, opening a tab — none of which
      // call a model. The thunk memoizes, so a stage making several LLM calls
      // still reads it once.
      //
      // `:id` is read as well as `:sessionId` because the pipeline routes are not
      // consistent about the name (`/review/:id/fix/...` vs
      // `/system-design/:sessionId/explain`), and a language resolved from only
      // one of them would leave half the LLM routes silently English. Attribution
      // above deliberately keeps using `:sessionId` alone — widening it there
      // would start recording unrelated `:id` params (a ticket, a user) as
      // sessions in the usage meter.
      resolveLanguage: sessionId
        ? lazyArtifactLanguage(() => this.languageOf(sessionId))
        : undefined,
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
