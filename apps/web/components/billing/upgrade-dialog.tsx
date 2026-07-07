'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardCheck,
  Code2,
  Coins,
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
import { PLANS, annualSavings, type BillingCycle } from '@archivato/shared';
import { billingApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/shared/toast';
import { cn } from '@/lib/utils';

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

/**
 * The Pro features shown in the modal. Text is resolved from `billing.features.
 * <key>.{lead,detail}`; the icon stays in code so it's independent of the
 * translated copy (and of ordering).
 */
const PRO_FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'projects', icon: FolderKanban },
  { key: 'api', icon: Webhook },
  { key: 'review', icon: ClipboardCheck },
  { key: 'roadmap', icon: Map },
  { key: 'cost', icon: Coins },
  { key: 'openapi', icon: Code2 },
  { key: 'refine', icon: MessageSquare },
  { key: 'export', icon: Download },
  { key: 'scaffold', icon: Package },
];

function UpgradeModal({
  feature,
  onSettle,
}: {
  feature?: string;
  onSettle: (upgraded: boolean) => void;
}) {
  const toast = useToast();
  const { t } = useTranslation('billing');
  const pro = PLANS.pro;
  const save = annualSavings(pro);
  const [cycle, setCycle] = useState<BillingCycle>('annual');
  const [busy, setBusy] = useState(false);
  const perMonth = cycle === 'annual' ? save.perMonthUsd : pro.priceUsd;

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
      const res = await billingApi.checkout(cycle);
      if (res.status === 'activated') {
        toast({ title: t('upgradedToast'), variant: 'success' });
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
          title: t('checkoutUnavailableTitle'),
          description: t('checkoutUnavailableBody'),
          variant: 'error',
        });
      }
    } catch (e) {
      toast({
        title: t('checkoutErrorTitle'),
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
            aria-label={t('close')}
            className="absolute end-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
            disabled={busy}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t('pro')}
            </span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <h2 id="upgrade-title" className="text-lg font-semibold leading-tight">
              {feature ? t('upgradeTo', { feature }) : t('unlock')}
            </h2>
            <div className="shrink-0 text-end leading-none" dir="ltr">
              <span className="text-2xl font-bold">${perMonth}</span>
              <span className="text-sm text-muted-foreground">
                {t('perMonth')}
              </span>
              {cycle === 'annual' && (
                <div className="mt-1 text-[11px] font-normal text-muted-foreground">
                  {t('cycle.billedAnnually', { price: save.annualUsd })}
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('everythingFreePre')}
            <span className="font-medium text-foreground">{t('plus')}</span>
          </p>
        </div>

        {/* Scrollable feature list — icon tile + two-tier text */}
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {PRO_FEATURES.map(({ key, icon: Icon }) => {
            const detail = t(`features.${key}.detail`);
            return (
              <li
                key={key}
                className="flex items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-snug">
                    {t(`features.${key}.lead`)}
                  </div>
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

        {/* Pinned footer — cadence toggle + actions always reachable */}
        <div className="shrink-0 space-y-3 border-t border-border bg-card p-4">
          <CycleToggle cycle={cycle} onChange={setCycle} savePct={save.savePct} disabled={busy} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => onSettle(false)}
              disabled={busy}
            >
              {t('maybeLater')}
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
              {busy
                ? t('working')
                : cycle === 'annual'
                  ? t('upgradeCtaAnnual', { price: save.annualUsd })
                  : t('upgradeCta', { price: pro.priceUsd })}
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            {t('cancelNote')}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Segmented Monthly | Annual selector with a savings pill on the annual side. */
function CycleToggle({
  cycle,
  onChange,
  savePct,
  disabled,
}: {
  cycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  savePct: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation('billing');
  return (
    <div
      role="radiogroup"
      aria-label={t('cycle.label')}
      className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1"
    >
      {(['monthly', 'annual'] as const).map((c) => {
        const active = cycle === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(c)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`cycle.${c}`)}
            {c === 'annual' && savePct > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {t('cycle.save', { pct: savePct })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
