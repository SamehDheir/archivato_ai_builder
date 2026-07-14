import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom, type Observable } from 'rxjs';
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
});
