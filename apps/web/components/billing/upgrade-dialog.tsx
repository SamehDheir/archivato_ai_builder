'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Check,
  ClipboardCheck,
  Code2,
  Download,
  FolderKanban,
  Loader2,
  Map,
  MessageSquare,
  Package,
  Sparkles,
  Webhook,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { PLANS } from '@archivato/shared';
import { billingApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/shared/toast';

export interface UpgradeOptions {
  /**
   * What the user was trying to do — shown as context in the modal, e.g.
   * "generate the API design". Keep it a lowercase verb phrase.
   */
  feature?: string;
}

/** Opens the upgrade modal; resolves `true` once the user is on Pro. */
type OpenUpgrade = (opts?: UpgradeOptions) => Promise<boolean>;

const UpgradeContext = createContext<OpenUpgrade | null>(null);

/**
 * Returns `openUpgrade(opts?)` — a promise that resolves `true` when the user
 * upgrades to Pro (mock: instantly; Paddle: only if activation completes in the
 * same session) and `false` if they dismiss. Must be used under
 * `<UpgradeProvider>`. Use it anywhere a free user hits a Pro wall.
 */
export function useUpgrade() {
  const ctx = useContext(UpgradeContext);
  if (!ctx) throw new Error('useUpgrade must be used within <UpgradeProvider>');
  return ctx;
}

/** Minimal shape of the Paddle.js global we call in Paddle mode. */
interface PaddleJs {
  Checkout?: {
    open?: (opts: {
      items: { priceId: string; quantity: number }[];
      customer?: { email: string };
    }) => void;
  };
}

export function UpgradeProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<UpgradeOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const open = useCallback<OpenUpgrade>((options) => {
    setOpts(options ?? {});
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((upgraded: boolean) => {
    resolver.current?.(upgraded);
    resolver.current = null;
    setOpts(null);
  }, []);

  return (
    <UpgradeContext.Provider value={open}>
      {children}
      {opts && <UpgradeModal feature={opts.feature} onSettle={settle} />}
    </UpgradeContext.Provider>
  );
}

/** Split a "Lead — detail" feature bullet into its two display tiers. */
function splitFeature(text: string): [string, string | null] {
  const idx = text.indexOf('—');
  if (idx === -1) return [text.trim(), null];
  return [text.slice(0, idx).trim(), text.slice(idx + 1).trim()];
}

/** Pick an icon for a Pro feature by keyword (robust to reordering). */
function featureIcon(text: string): LucideIcon {
  const t = text.toLowerCase();
  if (t.includes('project')) return FolderKanban;
  if (t.includes('api design') || t.includes('rest api')) return Webhook;
  if (t.includes('review')) return ClipboardCheck;
  if (t.includes('roadmap')) return Map;
  if (t.includes('openapi') || t.includes('swagger')) return Code2;
  if (t.includes('refine') || t.includes('chat')) return MessageSquare;
  if (t.includes('export')) return Download;
  if (t.includes('scaffold') || t.includes('repo') || t.includes('pdf'))
    return Package;
  return Check;
}

function UpgradeModal({
  feature,
  onSettle,
}: {
  feature?: string;
  onSettle: (upgraded: boolean) => void;
}) {
  const toast = useToast();
  const pro = PLANS.pro;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onSettle(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onSettle]);

  async function upgrade() {
    setBusy(true);
    try {
      const res = await billingApi.checkout();
      if (res.status === 'activated') {
        toast({ title: 'Upgraded to Pro 🎉', variant: 'success' });
        onSettle(true);
        return;
      }
      if (res.status === 'checkout' && res.paddle) {
        // Paddle mode: hand off to the checkout overlay if Paddle.js is loaded.
        const paddle = (window as unknown as { Paddle?: PaddleJs }).Paddle;
        if (paddle?.Checkout?.open) {
          paddle.Checkout.open({
            items: [{ priceId: res.paddle.priceId, quantity: 1 }],
            customer: { email: res.paddle.customerEmail },
          });
          // Activation arrives via webhook — close and let the user refresh.
          onSettle(false);
          return;
        }
        toast({
          title: 'Checkout not available',
          description: 'Paddle is not fully configured on this device yet.',
          variant: 'error',
        });
      }
    } catch (e) {
      toast({
        title: 'Could not start checkout',
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={() => !busy && onSettle(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95"
      >
        {/* Gradient header — price + context, always visible */}
        <div className="relative shrink-0 border-b border-border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
          <button
            type="button"
            onClick={() => !busy && onSettle(false)}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
            disabled={busy}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Pro plan
            </span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <h2 id="upgrade-title" className="text-lg font-semibold leading-tight">
              {feature ? `Upgrade to ${feature}` : 'Unlock the full pipeline'}
            </h2>
            <div className="shrink-0 text-right leading-none">
              <span className="text-2xl font-bold">${pro.priceUsd}</span>
              <span className="text-sm text-muted-foreground">/mo</span>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Everything in Free — interview, requirements, system &amp; database
            design — <span className="font-medium text-foreground">plus:</span>
          </p>
        </div>

        {/* Scrollable feature list — icon tile + two-tier text */}
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {pro.features.map((f) => {
            const [lead, detail] = splitFeature(f);
            const Icon = featureIcon(f);
            return (
              <li
                key={f}
                className="flex items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-snug">{lead}</div>
                  {detail && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {detail}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Pinned footer — actions always reachable */}
        <div className="shrink-0 space-y-3 border-t border-border bg-card p-4">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => onSettle(false)}
              disabled={busy}
            >
              Maybe later
            </Button>
            <Button
              onClick={upgrade}
              disabled={busy}
              className="sm:min-w-[190px]"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {busy ? 'Working…' : `Upgrade — $${pro.priceUsd}/mo`}
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Cancel anytime — you keep Pro until the period ends.
          </p>
        </div>
      </div>
    </div>
  );
}
