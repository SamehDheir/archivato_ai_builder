import type { StreamEvent, StreamStageName } from '@archivato/shared';
import {
  API_URL,
  ApiError,
  businessAnalysisApi,
  jobsApi,
  productVisionApi,
  qaPlanApi,
  roadmapApi,
  threatModelApi,
} from '@/lib/api';

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
 * SSE has no status code, so the server sends a `code` and this maps it back.
 * Anything unrecognized is a plain failure — never silently an entitlement or
 * readiness problem, which would send the caller down a recovery path (the
 * upgrade modal) for a fault that isn't one.
 */
const STREAM_ERROR_STATUS: Record<string, number> = {
  upgrade_required: 402,
  forbidden: 403,
  stage_not_ready: 409,
};

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
 * The non-streaming route for a stage, used whenever SSE can't be established.
 *
 * The design chain has BullMQ behind `/jobs`; the standalone stages never did
 * (nothing queues them), so their fallback is the same POST their own tab has
 * always called. Both go through the auth-refreshing `request()` wrapper, which
 * is the point — it is the path that survives the expired cookie EventSource
 * cannot refresh.
 */
function generateWithoutStream<T>(
  sessionId: string,
  stage: StreamStageName,
): Promise<T> {
  // A switch, not a lookup table: a table is built in full on every call, so it
  // dereferences all five clients to route to one. That is wasted work in the
  // browser and a hazard under a partial mock, where an unrelated client being
  // absent throws before the right one is ever reached.
  switch (stage) {
    case 'business-analysis':
      return businessAnalysisApi.generate(sessionId) as Promise<T>;
    case 'product-vision':
      return productVisionApi.generate(sessionId) as Promise<T>;
    case 'roadmap':
      return roadmapApi.generate(sessionId) as Promise<T>;
    case 'threat-model':
      return threatModelApi.generate(sessionId) as Promise<T>;
    case 'qa-plan':
      return qaPlanApi.generate(sessionId) as Promise<T>;
    default:
      return jobsApi.run<T>(sessionId, stage);
  }
}

/**
 * Open a Server-Sent Events stream for one stage and resolve with the generated
 * artifact. Each narration event is delivered to `onEvent` so the UI can render
 * the live "console".
 *
 * Resilience: if the stream errors *before any event arrives* (SSE blocked by a
 * proxy, EventSource unsupported, or an expired auth cookie that EventSource
 * can't refresh), we transparently fall back to the stage's non-streaming route.
 * A mid-stream drop after events have arrived surfaces as an error (the artifact
 * is still persisted and re-fetchable).
 */
export function streamStage<T>(
  sessionId: string,
  stage: StreamStageName,
  onEvent: (event: StreamEvent) => void,
): Promise<T> {
  // No EventSource (SSR / very old browser): go straight to the plain route.
  if (typeof EventSource === 'undefined') {
    return generateWithoutStream<T>(sessionId, stage);
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
        // Map back to the status the same failure carries over HTTP, so a caller
        // branching on `402` (pop the upgrade modal) or `409` (the stage's
        // upstream isn't ready) behaves identically whichever transport ran.
        const status = STREAM_ERROR_STATUS[event.code ?? ''] ?? 400;
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
        // Never connected — degrade to the stage's durable non-streaming route.
        generateWithoutStream<T>(sessionId, stage).then(resolve, reject);
      }
    };
  });
}
