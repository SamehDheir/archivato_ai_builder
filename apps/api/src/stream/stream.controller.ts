import {
  Controller,
  MessageEvent,
  Param,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import type { AuthUser, StreamEvent } from '@archivato/shared';
import { isStreamStage } from '@archivato/shared';
import { THROTTLE_AI } from '../common/throttling';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { StreamService } from './stream.service';

/**
 * Server-Sent Events endpoint for "live" stage generation. Runs the same
 * generation the async `/jobs` route does, but streams a narration of the work
 * as it happens instead of returning a single result to poll. Owner-scoped by
 * the same `SessionOwnerGuard`; the Pro entitlement gate lives in the service
 * (emitted as an `error` event) so a direct connection can't bypass it.
 *
 * The `/jobs` (BullMQ + poll) path stays as the non-streaming fallback.
 */
@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('stream')
export class StreamController {
  constructor(private readonly stream: StreamService) {}

  @Sse(':sessionId/:stage')
  @Throttle(THROTTLE_AI)
  generate(
    @Param('sessionId') sessionId: string,
    @Param('stage') stage: string,
    @CurrentUser() user: AuthUser,
  ): Observable<MessageEvent> {
    if (!isStreamStage(stage)) {
      // Surface as a single error event rather than throwing after headers.
      return new Observable((subscriber) => {
        subscriber.next({
          type: 'error',
          data: { type: 'error', message: `Unknown stage "${stage}".` },
        });
        subscriber.complete();
      });
    }

    // The generate analytics event is recorded inside the service, after the Pro
    // gate passes (so a gated free user doesn't inflate the metric).
    return this.toSse(this.stream.run(sessionId, stage, user.id));
  }

  /** Bridge the service's async generator to an SSE `Observable<MessageEvent>`. */
  private toSse(events: AsyncGenerator<StreamEvent>): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let cancelled = false;
      (async () => {
        try {
          for await (const event of events) {
            if (cancelled) return;
            // `type` becomes the SSE event name; `data` is JSON-serialized by Nest.
            subscriber.next({ type: event.type, data: event });
          }
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
        }
      })();
      // Client disconnect / unsubscribe: stop pulling from the generator.
      return () => {
        cancelled = true;
      };
    });
  }
}
