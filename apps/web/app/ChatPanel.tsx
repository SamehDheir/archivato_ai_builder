'use client';

import { useEffect, useState } from 'react';
import type { ChatMessage, RefineResult } from '@archivato/shared';
import { chatApi } from '../lib/api';

const EXAMPLES = [
  'Add notifications',
  'Make it scalable to 5 million users',
  'Add reporting dashboards',
];

/**
 * Post-generation refinement chat (Slice 10). Sends a natural-language
 * instruction, then hands the updated artifacts back to the page so the whole
 * design re-renders. The transcript is loaded from / saved to the server.
 */
export function ChatPanel({
  sessionId,
  onRefined,
}: {
  sessionId: string;
  onRefined: (result: RefineResult) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    chatApi.messages(sessionId).then(setMessages).catch(() => undefined);
  }, [sessionId]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    // Optimistically show the user's message (tracked so we can roll it back).
    const optimisticId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        sessionId,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInstruction('');
    try {
      const result = await chatApi.refine(sessionId, trimmed);
      setMessages(result.messages); // authoritative transcript from the server
      onRefined(result); // re-render the whole design with the updated artifacts
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Roll back the optimistic message and restore the text to the input.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInstruction(trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3>Refine with AI</h3>
      <p className="subtitle">
        Ask for a change and the requirements, architecture, database, and APIs
        update together.
      </p>

      {messages.length > 0 && (
        <div className="chat-log">
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role === 'user' ? 'a' : 'q'}`}>
              {m.role === 'assistant' && (
                <span className="phase-tag">AI</span>
              )}
              <div>{m.content}</div>
            </div>
          ))}
          {busy && (
            <div className="bubble q">
              <span className="phase-tag">AI</span>
              <div className="chat-thinking">
                <span className="spinner small" /> Redesigning…
              </div>
            </div>
          )}
        </div>
      )}

      <div className="chat-examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="chip"
            onClick={() => send(ex)}
            disabled={busy}
          >
            {ex}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(instruction);
        }}
      >
        <textarea
          placeholder="e.g. Add notifications, or make it scalable to 5M users…"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || instruction.trim().length < 3}>
          {busy ? 'Applying…' : 'Send'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
