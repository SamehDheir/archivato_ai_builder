import type { PipelineStageName, StreamEvent } from '@archivato/shared';
import { API_URL, ApiError, jobsApi } from '@/lib/api';

/** One rendered narration step, accumulated on the client from stream events. */
export interface StreamStep {
  id: string;
  label: string;
  /** The typed-out body, appended token-by-token. */
  body: string;
  /** True once a later step (or the terminal event) has superseded this one. */
  done: boolean;
}

/** The console's accumulated view, folded from the event sequence. */
export interface StreamView {
  steps: StreamStep[];
}

export const emptyStreamView: StreamView = { steps: [] };

/**
 * Fold one stream event into the console view (pure — safe as a React reducer).
 * Steps arrive newest-last; only the newest is "active" (spinner), the rest are
 * marked done. Tokens append to the step they name; terminal events settle all.
 */
export function reduceStreamEvent(
  view: StreamView,
  event: StreamEvent,
): StreamView {
  switch (event.type) {
    case 'step':
      return {
        steps: [
          ...view.steps.map((s) => ({ ...s, done: true })),
          { id: event.id, label: event.label, body: '', done: false },
        ],
      };
    case 'token':
      return {
        steps: view.steps.map((s) =>
          s.id === event.stepId ? { ...s, body: s.body + event.text } : s,
        ),
      };
    case 'artifact':
    case 'error':
      return { steps: view.steps.map((s) => ({ ...s, done: true })) };
    default:
      return view; // ping / unknown — no visible change
  }
}

/**
 * Open a Server-Sent Events stream for one pipeline stage and resolve with the
 * generated artifact. Each narration event is delivered to `onEvent` so the UI
 * can render the live "console".
 *
 * Resilience: if the stream errors *before any event arrives* (SSE blocked by a
 * proxy, EventSource unsupported, or an expired auth cookie that EventSource
 * can't refresh), we transparently fall back to the polling `/jobs` path — which
 * goes through the auth-refreshing `request()` wrapper. A mid-stream drop after
 * events have arrived surfaces as an error (the artifact is still persisted and
 * re-fetchable).
 */
export function streamStage<T>(
  sessionId: string,
  stage: PipelineStageName,
  onEvent: (event: StreamEvent) => void,
): Promise<T> {
  // No EventSource (SSR / very old browser): go straight to polling.
  if (typeof EventSource === 'undefined') {
    return jobsApi.run<T>(sessionId, stage);
  }

  return new Promise<T>((resolve, reject) => {
    const url = `${API_URL}/stream/${sessionId}/${stage}`;
    const es = new EventSource(url, { withCredentials: true });
    let received = false;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      es.close();
      fn();
    };

    const handle = (raw: MessageEvent) => {
      received = true;
      let event: StreamEvent;
      try {
        event = JSON.parse(raw.data) as StreamEvent;
      } catch {
        return; // ignore an unparseable frame (e.g. a comment heartbeat)
      }
      onEvent(event);
      if (event.type === 'artifact') {
        finish(() => resolve(event.result as T));
      } else if (event.type === 'error') {
        // Only the entitlement error maps to 402 (so callers can pop the
        // upgrade modal); every other failure is a generic error.
        const status = event.code === 'upgrade_required' ? 402 : 400;
        finish(() => reject(new ApiError(event.message, status, event.code)));
      }
    };

    for (const name of ['step', 'token', 'artifact', 'error', 'ping'] as const) {
      es.addEventListener(name, handle as EventListener);
    }

    es.onerror = () => {
      if (settled) return;
      settled = true;
      es.close();
      if (received) {
        // We already showed live output, then the connection dropped.
        reject(new Error('The stream was interrupted. Please try again.'));
      } else {
        // Never connected — degrade to the durable polling path.
        jobsApi.run<T>(sessionId, stage).then(resolve, reject);
      }
    };
  });
}
