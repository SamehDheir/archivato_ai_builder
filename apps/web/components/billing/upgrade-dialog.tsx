'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Check, Loader2, Sparkles, X, Zap } from 'lucide-react';
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
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95"
      >
        {/* Gradient header */}
        <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
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
          <h2 id="upgrade-title" className="mt-2 text-lg font-semibold">
            {feature ? `Upgrade to ${feature}` : 'Upgrade to Pro'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your Free plan covers the interview, requirements, system design, and
            database design. Pro unlocks the rest of the pipeline.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">${pro.priceUsd}</span>
            <span className="text-sm text-muted-foreground">/month</span>
          </div>

          <ul className="space-y-2">
            {pro.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => onSettle(false)}
              disabled={busy}
            >
              Maybe later
            </Button>
            <Button onClick={upgrade} disabled={busy}>
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
