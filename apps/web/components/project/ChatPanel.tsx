'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
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

  useEffect(() => {
    chatApi.messages(sessionId).then(setMessages).catch(() => undefined);
  }, [sessionId]);

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

  return (
    <div>
      <p className="text-sm text-muted-foreground">{t('refine.intro')}</p>

      {messages.length > 0 && (
        <div className="mt-3 space-y-2">
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
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((ex) => (
          <Button
            key={ex}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => send(ex)}
            disabled={busy}
          >
            {ex}
          </Button>
        ))}
      </div>

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(instruction);
        }}
      >
        <Textarea
          placeholder={t('refine.placeholder')}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={busy}
          dir="auto"
        />
        <Button type="submit" disabled={busy || instruction.trim().length < 3}>
          {busy ? t('refine.applying') : t('refine.send')}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
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
        <span className="mb-1 block text-xs font-semibold text-primary">
          {t('refine.ai')}
        </span>
      )}
      <div dir="auto">{children}</div>
    </div>
  );
}
