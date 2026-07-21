'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Send, Sparkles } from 'lucide-react';
import type { ChatMessage, RefineResult } from '@archivato/shared';
import { chatApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

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
  const { t } = useTranslation('stages');
  const examples = [
    t('refine.exampleNotifications'),
    t('refine.exampleScale'),
    t('refine.exampleReporting'),
  ];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatApi.messages(sessionId).then(setMessages).catch(() => undefined);
  }, [sessionId]);

  // Follow the conversation as it grows (new turn or the "redesigning" bubble).
  useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
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
      setMessages(result.messages);
      onRefined(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInstruction(trimmed);
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline (standard chat-composer UX).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(instruction);
    }
  }

  return (
    <div className="space-y-4">
      {/* AI agent identity — this refine chat IS the AI architect. */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t('refine.agentName')}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('refine.intro')}</p>
        </div>
      </div>

      {!empty && (
        <div className="space-y-2">
          {messages.map((m) => (
            <Bubble key={m.id} role={m.role}>
              {m.content}
            </Bubble>
          ))}
          {busy && (
            <Bubble role="assistant">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('refine.redesigning')}
              </span>
            </Bubble>
          )}
          <div ref={endRef} />
        </div>
      )}

      {/* Suggestions — labelled as a starting point only on the empty state. */}
      <div className="space-y-1.5">
        {empty && (
          <p className="text-xs font-medium text-muted-foreground">
            {t('refine.tryThese')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <Button
              key={ex}
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => send(ex)}
              disabled={busy}
            >
              <Plus className="h-3 w-3" />
              {ex}
            </Button>
          ))}
        </div>
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(instruction);
        }}
      >
        <Textarea
          placeholder={t('refine.placeholder')}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={onComposerKeyDown}
          disabled={busy}
          dir="auto"
          rows={3}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{t('refine.hint')}</span>
          <Button
            type="submit"
            className="gap-1.5"
            disabled={busy || instruction.trim().length < 3}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4 rtl:-scale-x-100" />
            )}
            {busy ? t('refine.applying') : t('refine.send')}
          </Button>
        </div>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Bubble({
  role,
  children,
}: {
  role: 'user' | 'assistant';
  children: React.ReactNode;
}) {
  const { t } = useTranslation('stages');
  const isUser = role === 'user';
  return (
    <div
      className={cn(
        'max-w-[85%] rounded-lg border px-3 py-2 text-sm',
        isUser
          ? 'ms-auto border-primary/40 bg-primary/10'
          : 'me-auto border-border bg-card',
      )}
    >
      {!isUser && (
        <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
          <Sparkles className="h-3 w-3" />
          {t('refine.agentName')}
        </span>
      )}
      <div dir="auto" className="whitespace-pre-wrap break-words">
        {children}
      </div>
    </div>
  );
}
