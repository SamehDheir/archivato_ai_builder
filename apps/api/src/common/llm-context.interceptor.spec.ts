import type { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  Observable,
  defer,
  firstValueFrom,
  lastValueFrom,
  toArray,
} from 'rxjs';
import type { LlmCallContext } from '../llm/usage/llm-usage.context';
import { currentLlmContext } from '../llm/usage/llm-usage.context';
import { LlmContextInterceptor } from './llm-context.interceptor';

interface FakeRequest {
  user?: { id: string };
  params?: Record<string, string>;
  path?: string;
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

async function run(req: FakeRequest, type = 'http') {
  const result = await firstValueFrom(
    new LlmContextInterceptor().intercept(contextFor(req, type), handler),
  );
  return result as LlmCallContext | undefined;
}

describe('LlmContextInterceptor', () => {
  it('exposes the caller to code the route handler awaits', async () => {
    const ctx = await run({
      user: { id: 'u1' },
      params: { sessionId: 's1' },
      path: '/api/system-design/s1/explain',
    });

    expect(ctx).toEqual({
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
        new LlmContextInterceptor()
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

      const sub = new LlmContextInterceptor()
        .intercept(contextFor({ path: '/api/stream/s1/review' }), neverEnding)
        .subscribe();
      expect(torn).toBe(false);

      sub.unsubscribe();
      expect(torn).toBe(true);
    });
  });
});
