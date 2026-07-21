import type { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  Observable,
  defer,
  firstValueFrom,
  lastValueFrom,
  toArray,
} from 'rxjs';
import type { ArtifactLanguage } from '@archivato/shared';
import type { LlmCallContext } from '../llm/usage/llm-usage.context';
import {
  currentArtifactLanguage,
  currentLlmContext,
} from '../llm/usage/llm-usage.context';
import type { InterviewSession } from '../interview/interview-session.entity';
import type { InterviewSessionRepository } from '../interview/interview-session.repository';
import { LlmContextInterceptor } from './llm-context.interceptor';

interface FakeRequest {
  user?: { id: string };
  params?: Record<string, string>;
  path?: string;
}

/** How many times the interceptor actually hit the session store. */
let sessionReads = 0;

/**
 * A store holding one session, so the language thunk has something to resolve.
 * `idea` is Arabic and `artifactLanguage` is null, which exercises the derive-on-
 * read path rather than a stored value.
 */
function fakeSessions(
  session: Partial<InterviewSession> | null = {
    input: { idea: 'نظام إدارة مكتبة للمدارس' },
    artifactLanguage: null,
  },
): InterviewSessionRepository {
  return {
    findById: async (id: string) => {
      sessionReads++;
      return session ? ({ id, ...session } as InterviewSession) : null;
    },
  } as unknown as InterviewSessionRepository;
}

function interceptor(sessions = fakeSessions()) {
  return new LlmContextInterceptor(sessions);
}

function contextFor(req: FakeRequest, type = 'http'): ExecutionContext {
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

/**
 * `next.handle()` DEFERS the route handler until subscription — so the handler
 * below reads the store only if the interceptor subscribed inside `als.run()`.
 * That's the whole point of the test: it fails if the interceptor merely wraps
 * the call.
 */
const handler: CallHandler = {
  handle: () =>
    defer(async () => {
      // Force an async hop, the way a real controller/service does.
      await Promise.resolve();
      return currentLlmContext();
    }) as Observable<unknown>,
};

async function run(req: FakeRequest, type = 'http', sessions = fakeSessions()) {
  const result = await firstValueFrom(
    interceptor(sessions).intercept(contextFor(req, type), handler),
  );
  return result as LlmCallContext | undefined;
}

beforeEach(() => {
  sessionReads = 0;
});

describe('LlmContextInterceptor', () => {
  it('exposes the caller to code the route handler awaits', async () => {
    const ctx = await run({
      user: { id: 'u1' },
      params: { sessionId: 's1' },
      path: '/api/system-design/s1/explain',
    });

    expect(ctx).toMatchObject({
      userId: 'u1',
      sessionId: 's1',
      stage: 'system-design',
    });
  });

  it('prefers an explicit :stage param over the path (jobs + stream routes)', async () => {
    const ctx = await run({
      user: { id: 'u1' },
      params: { sessionId: 's1', stage: 'api-design' },
      path: '/api/jobs/s1/api-design',
    });

    expect(ctx?.stage).toBe('api-design');
  });

  it('normalizes an LLM-free route to `other` rather than inventing a stage', async () => {
    const ctx = await run({ path: '/api/scaffold/s1/zip' });

    expect(ctx).toEqual({ userId: null, sessionId: null, stage: 'other' });
  });

  it('leaves non-HTTP contexts alone', async () => {
    expect(await run({ path: '/api/interview' }, 'ws')).toBeUndefined();
  });

  /**
   * The interceptor is the HTTP half of the two-place seam that tells all fifteen
   * agents what language to write in. Before it existed only the interviewer and
   * the proposal writer were told anything, and the other thirteen produced a
   * different language per field.
   */
  describe('artifact language', () => {
    it('resolves the project language for an agent that asks for it', async () => {
      const ctx = await run({
        params: { sessionId: 's1' },
        path: '/api/requirements/s1',
      });

      await expect(ctx!.resolveLanguage!()).resolves.toBe<ArtifactLanguage>('ar');
    });

    it('costs NOTHING on a request that never calls a model', async () => {
      // The whole reason it is a thunk. This interceptor is global, so eagerly
      // reading the session would add a query to every poll of the interview
      // state and every tab open.
      await run({ params: { sessionId: 's1' }, path: '/api/interview/s1' });

      expect(sessionReads).toBe(0);
    });

    it('reads the session once no matter how many calls a stage makes', async () => {
      const ctx = await run({
        params: { sessionId: 's1' },
        path: '/api/api-design/s1',
      });
      // The API designer chunks: one stage, many calls, one language.
      await Promise.all([
        ctx!.resolveLanguage!(),
        ctx!.resolveLanguage!(),
        ctx!.resolveLanguage!(),
      ]);

      expect(sessionReads).toBe(1);
    });

    it('reads `:id` too, since the pipeline routes are not consistent about it', async () => {
      // `/review/:id/fix/propose` calls a model. Naming only `:sessionId` here
      // would have left half the LLM routes silently generating English.
      const ctx = await run({
        params: { id: 's1' },
        path: '/api/review/s1/fix/propose',
      });

      await expect(ctx!.resolveLanguage!()).resolves.toBe<ArtifactLanguage>('ar');
    });

    it('falls back to English rather than failing a generation', async () => {
      // A session that vanished mid-generation, or a DB blip. Losing the language
      // must cost the artifact its localization, never its existence.
      const missing = fakeSessions(null);
      const ctx = await run(
        { params: { sessionId: 'gone' }, path: '/api/requirements/gone' },
        'http',
        missing,
      );

      await expect(ctx!.resolveLanguage!()).resolves.toBe<ArtifactLanguage>('en');
    });

    it('gives an agent English when it runs outside any request', async () => {
      // A script, a test, a code path with no context at all.
      await expect(currentArtifactLanguage()).resolves.toBe<ArtifactLanguage>('en');
    });
  });

  /**
   * The `@Sse()` stream route hands Nest a long-lived Observable rather than a
   * promise. The interceptor now sits in front of it, so it has to forward every
   * emission unchanged AND propagate unsubscribe (a client disconnect must still
   * stop the generator). This is the riskiest path the interceptor touches.
   */
  describe('SSE-shaped handlers (an Observable, not a promise)', () => {
    it('forwards every event and keeps the context across emissions', async () => {
      let torn = false;
      const sseHandler: CallHandler = {
        handle: () =>
          new Observable<unknown>((subscriber) => {
            // Emit asynchronously, the way a streaming generator does.
            void (async () => {
              await Promise.resolve();
              subscriber.next({ event: 1, ctx: currentLlmContext()?.stage });
              await Promise.resolve();
              subscriber.next({ event: 2, ctx: currentLlmContext()?.stage });
              subscriber.complete();
            })();
            return () => {
              torn = true;
            };
          }),
      };

      const events = await lastValueFrom(
        interceptor()
          .intercept(
            contextFor({
              user: { id: 'u1' },
              params: { sessionId: 's1', stage: 'review' },
              path: '/api/stream/s1/review',
            }),
            sseHandler,
          )
          .pipe(toArray()),
      );

      expect(events).toEqual([
        { event: 1, ctx: 'review' },
        { event: 2, ctx: 'review' },
      ]);
      expect(torn).toBe(true);
    });

    it('propagates unsubscribe so a client disconnect stops the stream', () => {
      let torn = false;
      const neverEnding: CallHandler = {
        handle: () =>
          new Observable<unknown>(() => () => {
            torn = true;
          }),
      };

      const sub = interceptor()
        .intercept(contextFor({ path: '/api/stream/s1/review' }), neverEnding)
        .subscribe();
      expect(torn).toBe(false);

      sub.unsubscribe();
      expect(torn).toBe(true);
    });
  });
});
