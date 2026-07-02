'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
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
import { ThemeToggle } from '@/components/shared/theme';
import { useToast } from '@/components/shared/toast';
import { useConfirm } from '@/components/shared/confirm-dialog';

const PROVIDER_LABEL: Record<string, string> = {
  password: 'Email & password',
  google: 'Google',
  github: 'GitHub',
};

/**
 * Account settings (`/settings`): profile, security (change/set password),
 * appearance, and a danger zone to delete the account. Loads the current user
 * on mount and keeps it in local state so edits reflect immediately.
 */
export function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

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
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-12 text-center text-muted-foreground">
        You need to be signed in to view settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Manage your profile, security, and preferences.
      </p>

      <div className="space-y-6">
        <ProfileSection user={user} onUpdated={setUser} />
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
  const [displayName, setDisplayName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  const dirty = displayName.trim() !== user.displayName && displayName.trim().length > 0;

  async function save() {
    setSaving(true);
    try {
      const updated = await authApi.updateProfile({ displayName: displayName.trim() });
      onUpdated(updated);
      toast({ title: 'Profile updated', variant: 'success' });
    } catch (e) {
      toast({
        title: 'Could not update profile',
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
      toast({ title: 'Verification email sent', variant: 'success' });
    } catch {
      toast({ title: 'Could not send verification email', variant: 'error' });
    } finally {
      setResending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your account details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <div className="flex gap-2">
            <Input
              id="displayName"
              value={displayName}
              maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Email</Label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">{user.email}</span>
            {user.emailVerified ? (
              <Badge variant="default">verified</Badge>
            ) : (
              <>
                <Badge variant="warning">unverified</Badge>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={resend}
                  disabled={resending}
                >
                  {resending ? 'Sending…' : 'Resend verification'}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Member since</div>
            <div>{new Date(user.createdAt).toLocaleDateString()}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Sign-in methods</div>
            <div className="mt-0.5 flex flex-wrap gap-1.5">
              {user.providers.map((p) => (
                <Badge key={p} variant="secondary">
                  {PROVIDER_LABEL[p] ?? p}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
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
        title: hasPassword ? 'Password changed' : 'Password set',
        description: 'Other devices have been signed out.',
        variant: 'success',
      });
    } catch (e) {
      toast({
        title: 'Could not update password',
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
        <CardTitle>{hasPassword ? 'Change password' : 'Set a password'}</CardTitle>
        <CardDescription>
          {hasPassword
            ? 'Changing your password signs out your other devices.'
            : 'Add a password so you can also sign in with your email, not only ' +
              `${user.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(' / ')}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            minLength={8}
            placeholder="At least 8 characters"
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {mismatch && (
            <p className="text-sm text-destructive">Passwords don&apos;t match.</p>
          )}
        </div>
        <Button onClick={submit} disabled={!canSubmit}>
          {saving ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Appearance: surface the existing light/dark theme toggle. */
function AppearanceSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Archivato looks on this device.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="text-sm">Theme</span>
        <ThemeToggle />
      </CardContent>
    </Card>
  );
}

/** Danger zone: irreversible account deletion behind a confirm dialog. */
function DangerSection({ onDeleted }: { onDeleted: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: 'Delete your account?',
      description:
        'This permanently deletes your account and every project, design, and ' +
        'artifact you own. This cannot be undone.',
      confirmLabel: 'Delete account',
      cancelLabel: 'Keep account',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await authApi.deleteAccount();
      toast({ title: 'Account deleted', variant: 'success' });
      onDeleted();
    } catch (e) {
      toast({
        title: 'Could not delete account',
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
          <ShieldCheck className="h-4 w-4" /> Danger zone
        </CardTitle>
        <CardDescription>
          Permanently delete your account and all of your projects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={remove} disabled={deleting}>
          <Trash2 className="h-4 w-4" />
          {deleting ? 'Deleting…' : 'Delete account'}
        </Button>
      </CardContent>
    </Card>
  );
}
