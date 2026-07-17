'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Check,
  Loader2,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  countInQuotaPeriod,
  isUnlimitedQuota,
  PLANS,
  type AuthUser,
  type SubscriptionView,
} from '@archivato/shared';
import { authApi, billingApi, interviewApi } from '@/lib/api';
import { fileToAvatarDataUri } from '@/lib/avatar';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useFormat } from '@/lib/i18n/format';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeToggle } from '@/components/shared/theme';
import { useToast } from '@/components/shared/toast';
import { useConfirm } from '@/components/shared/confirm-dialog';

/**
 * Account settings (`/settings`): profile, security (change/set password),
 * appearance, and a danger zone to delete the account. Loads the current user
 * on mount and keeps it in local state so edits reflect immediately.
 */
export function SettingsPage() {
  const router = useRouter();
  const { t } = useTranslation('settings');

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then((u) => setUser(u))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-sm" />
        <div className="mt-6 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-12 text-center text-muted-foreground">
        {t('signedOut')}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> {t('back')}
      </Link>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

      <div className="space-y-6">
        <ProfileSection user={user} onUpdated={setUser} />
        <BillingSection />
        <SecuritySection user={user} onUpdated={setUser} />
        <AppearanceSection />
        <DangerSection
          onDeleted={() => {
            router.replace('/');
          }}
        />
      </div>
    </div>
  );
}

/** Profile: display name (editable), email + verification, member since, providers. */
function ProfileSection({
  user,
  onUpdated,
}: {
  user: AuthUser;
  onUpdated: (u: AuthUser) => void;
}) {
  const toast = useToast();
  const { t } = useTranslation('settings');
  const fmt = useFormat();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = displayName.trim() !== user.displayName && displayName.trim().length > 0;

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after a failure
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('profile.photoInvalid'), variant: 'error' });
      return;
    }
    setPhotoBusy(true);
    try {
      const dataUri = await fileToAvatarDataUri(file);
      const updated = await authApi.updateAvatar(dataUri);
      onUpdated(updated);
      toast({ title: t('profile.photoUpdated'), variant: 'success' });
    } catch (err) {
      toast({
        title: t('profile.photoFailed'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      const updated = await authApi.removeAvatar();
      onUpdated(updated);
      toast({ title: t('profile.photoRemoved'), variant: 'success' });
    } catch (err) {
      toast({
        title: t('profile.photoFailed'),
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await authApi.updateProfile({ displayName: displayName.trim() });
      onUpdated(updated);
      toast({ title: t('profile.updated'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('profile.updateFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      await authApi.resendVerification();
      toast({ title: t('profile.verificationSent'), variant: 'success' });
    } catch {
      toast({ title: t('profile.verificationFailed'), variant: 'error' });
    } finally {
      setResending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.title')}</CardTitle>
        <CardDescription>{t('profile.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <UserAvatar name={user.displayName} src={user.avatarUrl} size={64} />
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickPhoto}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={photoBusy}
                onClick={() => fileRef.current?.click()}
              >
                {photoBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {user.avatarUrl
                  ? t('profile.changePhoto')
                  : t('profile.addPhoto')}
              </Button>
              {user.avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={photoBusy}
                  onClick={removePhoto}
                >
                  {t('profile.removePhoto')}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('profile.photoHint')}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="displayName">{t('profile.displayName')}</Label>
          <div className="flex gap-2">
            <Input
              id="displayName"
              value={displayName}
              maxLength={80}
              dir="auto"
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? t('profile.saving') : t('profile.save')}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t('profile.email')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm" dir="ltr">
              {user.email}
            </span>
            {user.emailVerified ? (
              <Badge variant="default">{t('profile.verified')}</Badge>
            ) : (
              <>
                <Badge variant="warning">{t('profile.unverified')}</Badge>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={resend}
                  disabled={resending}
                >
                  {resending ? t('profile.sending') : t('profile.resend')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">{t('profile.memberSince')}</div>
            <div>{fmt.date(user.createdAt)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('profile.signInMethods')}</div>
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              {user.providers.map((p) => (
                <Badge key={p} variant="secondary">
                  {t(`provider.${p}`, { defaultValue: p })}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Plan & billing: current plan, quota usage, and upgrade/cancel. */
function BillingSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useTranslation('settings');
  const fmt = useFormat();
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [subscription, projects] = await Promise.all([
        billingApi.subscription(),
        interviewApi.list().catch(() => []),
      ]);
      setSub(subscription);
      // The quota is a rate per calendar month, so the meter is what was CREATED
      // this period — not how many projects are owned.
      setUsed(
        countInQuotaPeriod(
          projects.map((p) => p.createdAt).filter((d): d is string => !!d),
        ),
      );
    } catch {
      /* not signed in / unavailable */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function upgrade() {
    setBusy(true);
    try {
      const res = await billingApi.checkout();
      if (res.status === 'activated') {
        toast({ title: t('billing.upgraded'), variant: 'success' });
        await load();
      } else if (res.status === 'checkout' && res.paddle) {
        // Paddle mode: open the checkout overlay if Paddle.js is loaded.
        const paddle = (window as unknown as { Paddle?: PaddleJs }).Paddle;
        if (paddle?.Checkout?.open) {
          paddle.Checkout.open({
            items: [{ priceId: res.paddle.priceId, quantity: 1 }],
            customer: { email: res.paddle.customerEmail },
          });
        } else {
          toast({
            title: t('billing.checkoutUnavailable'),
            description: t('billing.checkoutUnavailableDetail'),
            variant: 'error',
          });
        }
      }
    } catch (e) {
      toast({
        title: t('billing.checkoutFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const ok = await confirm({
      title: t('billing.cancelTitle'),
      description: t('billing.cancelDescription'),
      confirmLabel: t('billing.cancelConfirm'),
      cancelLabel: t('billing.cancelKeep'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      setSub(await billingApi.cancel());
      toast({ title: t('billing.canceled'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('billing.cancelFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  const pro = PLANS.pro;
  const isPro = sub?.plan === 'pro';

  // Tier names are product brands, not prose: they come from PLANS (the single
  // source of truth) and read the same in every locale.
  const planName = PLANS[sub?.plan ?? 'free'].name;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('billing.title')}</CardTitle>
        <CardDescription>{t('billing.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading || !sub ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {t('billing.planLabel', { plan: planName })}
                  </span>
                  {isPro && <Badge variant="primary">{t('billing.proBadge')}</Badge>}
                  {isPro && sub.billingCycle === 'annual' && (
                    <Badge variant="secondary">{t('billing.annualBadge')}</Badge>
                  )}
                  {sub.cancelAtPeriodEnd && (
                    <Badge variant="warning">{t('billing.cancelsBadge')}</Badge>
                  )}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {isUnlimitedQuota(sub.projectQuota)
                    ? t('billing.usageUnlimited')
                    : t('billing.usageMonth', {
                        used: used ?? '—',
                        quota: sub.projectQuota,
                      })}
                  {isPro && sub.periodEnd
                    ? ` · ${
                        sub.cancelAtPeriodEnd
                          ? t('billing.ends', { date: fmt.date(sub.periodEnd) })
                          : t('billing.renews', { date: fmt.date(sub.periodEnd) })
                      }`
                    : ''}
                </div>
              </div>
              {isPro ? (
                <Button variant="outline" onClick={cancel} disabled={busy}>
                  {busy ? t('billing.working') : t('billing.cancel')}
                </Button>
              ) : (
                <Button onClick={upgrade} disabled={busy}>
                  <Zap className="h-4 w-4" />
                  {busy
                    ? t('billing.working')
                    : t('billing.upgrade', { price: pro.priceUsd })}
                </Button>
              )}
            </div>

            {!isPro && <ProFeatureCard price={pro.priceUsd} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The Pro upsell bullet list, reusing the localized billing feature copy. */
const PRO_FEATURE_KEYS = [
  'projects',
  'api',
  'review',
  'roadmap',
  'refine',
  'export',
] as const;

function ProFeatureCard({ price }: { price: number }) {
  const { t } = useTranslation('settings');
  const { t: bt } = useTranslation('billing');
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="text-sm font-semibold">
        {t('billing.proHeading', { price })}
      </div>
      <ul className="mt-2 space-y-1">
        {PRO_FEATURE_KEYS.map((k) => (
          <li
            key={k}
            className="flex items-start gap-2 text-sm text-muted-foreground"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{' '}
            {bt(`features.${k}.lead`)}
          </li>
        ))}
      </ul>
    </div>
  );
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

/** Security: change an existing password, or set a first one on an OAuth account. */
function SecuritySection({
  user,
  onUpdated,
}: {
  user: AuthUser;
  onUpdated: (u: AuthUser) => void;
}) {
  const toast = useToast();
  const { t } = useTranslation('settings');
  const hasPassword = user.providers.includes('password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    (!hasPassword || currentPassword.length > 0) &&
    !saving;

  async function submit() {
    setSaving(true);
    try {
      const updated = await authApi.changePassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      onUpdated(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({
        title: hasPassword ? t('security.changed') : t('security.set'),
        description: t('security.otherSignedOut'),
        variant: 'success',
      });
    } catch (e) {
      toast({
        title: t('security.failed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {hasPassword ? t('security.changeTitle') : t('security.setTitle')}
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? t('security.changeDescription')
            : t('security.setDescription', {
                providers: user.providers
                  .map((p) => t(`provider.${p}`, { defaultValue: p }))
                  .join(' / '),
              })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">{t('security.current')}</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              dir="ltr"
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">{t('security.new')}</Label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            minLength={8}
            dir="ltr"
            placeholder={t('security.newPlaceholder')}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">{t('security.confirm')}</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            dir="ltr"
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {mismatch && (
            <p className="text-sm text-destructive">{t('security.mismatch')}</p>
          )}
        </div>
        <Button onClick={submit} disabled={!canSubmit}>
          {saving
            ? t('security.saving')
            : hasPassword
              ? t('security.changeBtn')
              : t('security.setBtn')}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Appearance: surface the existing light/dark theme toggle. */
function AppearanceSection() {
  const { t } = useTranslation('settings');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance.title')}</CardTitle>
        <CardDescription>{t('appearance.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="text-sm">{t('appearance.theme')}</span>
        <ThemeToggle />
      </CardContent>
    </Card>
  );
}

/** Danger zone: irreversible account deletion behind a confirm dialog. */
function DangerSection({ onDeleted }: { onDeleted: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useTranslation('settings');
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: t('danger.confirmTitle'),
      description: t('danger.confirmDescription'),
      confirmLabel: t('danger.confirmDelete'),
      cancelLabel: t('danger.confirmKeep'),
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await authApi.deleteAccount();
      toast({ title: t('danger.deleted'), variant: 'success' });
      onDeleted();
    } catch (e) {
      toast({
        title: t('danger.failed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
      setDeleting(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <ShieldCheck className="h-4 w-4" /> {t('danger.title')}
        </CardTitle>
        <CardDescription>{t('danger.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={remove} disabled={deleting}>
          <Trash2 className="h-4 w-4" />
          {deleting ? t('danger.deleting') : t('danger.delete')}
        </Button>
      </CardContent>
    </Card>
  );
}
