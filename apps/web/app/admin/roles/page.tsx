'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Shield,
  Users,
  Loader2,
  Lock,
  UserPlus,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react';
import {
  PERMISSION_CATALOG,
  SUPER_ADMIN_ROLE_KEY,
  hasPermission,
  type AdminUserRow,
  type AuthUser,
  type Permission,
  type RoleView,
} from '@archivato/shared';
import { adminApi, authApi, rolesApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/shared/toast';
import { useConfirm } from '@/components/shared/confirm-dialog';

const DOMAINS = [...new Set(PERMISSION_CATALOG.map((p) => p.domain))];

/** Permission keys carry ':' (an i18next namespace separator) — map to '_' for keys. */
const permKey = (k: string) => k.replace(/:/g, '_');

/** A grid of permission checkboxes grouped by domain. */
function PermissionGrid({
  selected,
  onToggle,
  disabled,
}: {
  selected: Set<Permission>;
  onToggle: (p: Permission) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('admin');
  return (
    <div className="space-y-3">
      {DOMAINS.map((domain) => (
        <div key={domain}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`roles.domain.${domain}`)}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PERMISSION_CATALOG.filter((p) => p.domain === domain).map((p) => {
              const label = t(`roles.perm.${permKey(p.key)}.label`);
              const description = t(`roles.perm.${permKey(p.key)}.description`);
              return (
                <label
                  key={p.key}
                  className={`flex items-start gap-2 rounded-md border border-border p-2 text-sm ${
                    disabled ? 'opacity-60' : 'cursor-pointer hover:border-primary/40'
                  }`}
                  title={description}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(p.key)}
                    disabled={disabled}
                    onChange={() => onToggle(p.key)}
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One editable role card. */
function RoleCard({
  role,
  onSaved,
  onDeleted,
}: {
  role: RoleView;
  onSaved: (r: RoleView) => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useTranslation('admin');
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [perms, setPerms] = useState<Set<Permission>>(new Set(role.permissions));
  const [busy, setBusy] = useState(false);

  const locked = role.key === SUPER_ADMIN_ROLE_KEY; // full catalog, immutable perms
  const dirty =
    name !== role.name ||
    description !== role.description ||
    perms.size !== role.permissions.length ||
    !role.permissions.every((p) => perms.has(p));

  function toggle(p: Permission) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      const updated = await rolesApi.update(role.id, {
        name,
        description,
        permissions: [...perms],
      });
      onSaved(updated);
      toast({ title: t('roles.toast.saved', { name: updated.name }), variant: 'success' });
    } catch (e) {
      toast({
        title: t('roles.toast.saveFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t('roles.confirm.deleteTitle', { name: role.name }),
      description: t('roles.confirm.deleteBody'),
      confirmLabel: t('roles.confirm.deleteConfirm'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await rolesApi.remove(role.id);
      onDeleted(role.id);
      toast({ title: t('roles.toast.deleted'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('roles.toast.deleteFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {role.isSystem ? (
              <span className="font-semibold">{role.name}</span>
            ) : (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 max-w-[220px]"
              />
            )}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {role.key}
            </code>
            {role.isSystem && <Badge variant="secondary">{t('roles.system')}</Badge>}
            {locked && (
              <Badge variant="primary">
                <Lock className="me-1 h-3 w-3" /> {t('roles.fullAccess')}
              </Badge>
            )}
          </div>
          {role.isSystem ? (
            <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
          ) : (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-2 min-h-[44px]"
              placeholder={t('roles.describePlaceholder')}
            />
          )}
        </div>
        <div className="shrink-0 text-end">
          <div className="text-xs text-muted-foreground">
            {t('roles.userCount', { n: role.userCount })}
          </div>
          {!role.isSystem && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 text-destructive"
              onClick={remove}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <PermissionGrid selected={perms} onToggle={toggle} disabled={locked} />
      </div>

      {!locked && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={!dirty || busy}>
            {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
            {t('roles.saveChanges')}
          </Button>
          {dirty && (
            <span className="text-xs text-muted-foreground">{t('roles.unsaved')}</span>
          )}
        </div>
      )}
    </Card>
  );
}

/** Create-role form. */
function CreateRole({ onCreated }: { onCreated: (r: RoleView) => void }) {
  const { t } = useTranslation('admin');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [perms, setPerms] = useState<Set<Permission>>(new Set());
  const [busy, setBusy] = useState(false);

  async function create() {
    if (name.trim().length < 2) {
      toast({ title: t('roles.nameRequired'), variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const role = await rolesApi.create({
        name: name.trim(),
        description: description.trim(),
        permissions: [...perms],
      });
      onCreated(role);
      toast({ title: t('roles.toast.created', { name: role.name }), variant: 'success' });
      setName('');
      setDescription('');
      setPerms(new Set());
      setOpen(false);
    } catch (e) {
      toast({
        title: t('roles.toast.createFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="me-1.5 h-4 w-4" /> {t('roles.newRole')}
      </Button>
    );
  }

  return (
    <Card className="border-primary/30 p-4">
      <div className="font-semibold">{t('roles.newRoleHeading')}</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <Label>{t('roles.nameLabel')}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('roles.namePlaceholder')}
          />
        </div>
        <div>
          <Label>{t('roles.descLabel')}</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('roles.descPlaceholder')}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label>{t('roles.permsLabel')}</Label>
        <div className="mt-1">
          <PermissionGrid
            selected={perms}
            onToggle={(p) =>
              setPerms((prev) => {
                const next = new Set(prev);
                if (next.has(p)) next.delete(p);
                else next.add(p);
                return next;
              })
            }
          />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={create} disabled={busy}>
          {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
          {t('roles.createRole')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('roles.cancel')}
        </Button>
      </div>
    </Card>
  );
}

/** Assign roles to a single user (fetches their current ids on expand). */
function UserRoleEditor({
  user,
  roles,
  onChanged,
}: {
  user: AdminUserRow;
  roles: RoleView[];
  onChanged: (keys: string[]) => void;
}) {
  const { t } = useTranslation('admin');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);

  async function expand() {
    setOpen(true);
    if (ids) return;
    try {
      const { roleIds } = await rolesApi.userRoles(user.id);
      setIds(new Set(roleIds));
    } catch {
      setIds(new Set());
    }
  }

  async function save() {
    if (!ids) return;
    setBusy(true);
    try {
      await rolesApi.setUserRoles(user.id, [...ids]);
      const keys = roles.filter((r) => ids.has(r.id)).map((r) => r.key);
      onChanged(keys);
      toast({ title: t('roles.toast.rolesUpdated'), variant: 'success' });
      setOpen(false);
    } catch (e) {
      toast({
        title: t('roles.toast.rolesFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{user.displayName}</div>
          <div dir="ltr" className="truncate text-xs text-muted-foreground">
            {user.email}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {user.roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">{t('roles.noRoles')}</span>
          ) : (
            user.roles.map((k) => (
              <Badge key={k} variant="secondary">
                {roles.find((r) => r.key === k)?.name ?? k}
              </Badge>
            ))
          )}
          <Button size="sm" variant="ghost" onClick={open ? () => setOpen(false) : expand}>
            {open ? t('roles.close') : t('roles.edit')}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-2 border-t border-border pt-2">
          {!ids ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => {
                  const on = ids.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() =>
                        setIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        })
                      }
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                        on
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
              <Button size="sm" className="mt-2" onClick={save} disabled={busy}>
                {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
                {t('roles.saveRoles')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Provision a staff account: enter an email + name, pick roles, and the server
 * creates a pre-verified account with a generated strong password (shown once).
 * No self-registration — this is how support/billing/admin staff get accounts.
 */
function ProvisionStaff({
  roles,
  onProvisioned,
}: {
  roles: RoleView[];
  onProvisioned: () => void;
}) {
  const { t } = useTranslation('admin');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  // Roles that actually grant something — assigning only "user" wouldn't make
  // this a staff account.
  const assignableRoles = useMemo(
    () => roles.filter((r) => r.permissions.length > 0),
    [roles],
  );

  function reset() {
    setEmail('');
    setDisplayName('');
    setRoleIds(new Set());
  }

  async function provision() {
    if (roleIds.size === 0) {
      toast({ title: t('roles.provision.pickRole'), variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      const { user, tempPassword } = await rolesApi.provisionUser({
        email: email.trim(),
        displayName: displayName.trim(),
        roleIds: [...roleIds],
      });
      setResult({ email: user.email, password: tempPassword });
      reset();
      onProvisioned();
    } catch (e) {
      toast({
        title: t('roles.provision.createFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: t('roles.provision.copyFailed'), variant: 'error' });
    }
  }

  // One-time credential hand-off. Shown until dismissed; the password can never
  // be retrieved again (only its hash is stored server-side).
  if (result) {
    return (
      <Card className="border-primary/40 p-4">
        <div className="flex items-center gap-2 font-semibold text-primary">
          <Check className="h-4 w-4" /> {t('roles.provision.createdTitle')}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('roles.provision.createdBody')}
        </p>
        <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <div>
            <div className="text-xs text-muted-foreground">
              {t('roles.provision.email')}
            </div>
            <code dir="ltr" className="text-sm">
              {result.email}
            </code>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {t('roles.provision.tempPassword')}
            </div>
            <div className="flex items-center gap-2">
              <code dir="ltr" className="select-all text-sm font-semibold">
                {result.password}
              </code>
              <Button size="sm" variant="ghost" onClick={copyPassword}>
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => {
            setResult(null);
            setOpen(false);
          }}
        >
          {t('roles.provision.done')}
        </Button>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus className="me-1.5 h-4 w-4" /> {t('roles.provision.open')}
      </Button>
    );
  }

  return (
    <Card className="border-primary/30 p-4">
      <div className="flex items-center gap-2 font-semibold">
        <KeyRound className="h-4 w-4 text-primary" /> {t('roles.provision.heading')}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('roles.provision.subtitle')}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <Label>{t('roles.provision.emailLabel')}</Label>
          <Input
            dir="ltr"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('roles.provision.emailPlaceholder')}
          />
        </div>
        <div>
          <Label>{t('roles.provision.nameLabel')}</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('roles.provision.namePlaceholder')}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label>{t('roles.provision.rolesLabel')}</Label>
        {assignableRoles.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('roles.provision.noStaffRoles')}
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {assignableRoles.map((r) => {
              const on = roleIds.has(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    setRoleIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                    on
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={provision} disabled={busy}>
          {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
          {t('roles.provision.create')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          {t('roles.cancel')}
        </Button>
      </div>
    </Card>
  );
}

export default function RolesPage() {
  const { t } = useTranslation('admin');
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<RoleView[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.me().then((me) => {
      if (!hasPermission(me?.permissions, 'admin:roles:manage')) {
        router.replace('/dashboard');
        return;
      }
      setUser(me);
      Promise.all([rolesApi.list(), adminApi.users(1, 50)])
        .then(([r, u]) => {
          setRoles(r);
          setUsers(u.users);
        })
        .catch((e) =>
          toast({
            title: t('roles.toast.loadFailed'),
            description: e instanceof Error ? e.message : String(e),
            variant: 'error',
          }),
        )
        .finally(() => setLoading(false));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => Number(b.isSystem) - Number(a.isSystem)),
    [roles],
  );

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> {t('roles.back')}
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">{t('roles.title')}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t('roles.subtitle')}</p>

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center justify-between">
            <h2 className="font-semibold">{t('roles.rolesHeading')}</h2>
            <CreateRole onCreated={(r) => setRoles((prev) => [...prev, r])} />
          </div>
          <div className="mt-3 space-y-3">
            {sortedRoles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                onSaved={(u) =>
                  setRoles((prev) => prev.map((r) => (r.id === u.id ? u : r)))
                }
                onDeleted={(id) =>
                  setRoles((prev) => prev.filter((r) => r.id !== id))
                }
              />
            ))}
          </div>

          <div className="mt-8 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t('roles.staffHeading')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('roles.staffSubtitle')}</p>
          <div className="mt-3">
            <ProvisionStaff
              roles={roles}
              onProvisioned={() =>
                adminApi
                  .users(1, 50)
                  .then((u) => setUsers(u.users))
                  .catch(() => undefined)
              }
            />
          </div>

          <div className="mt-8 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">{t('roles.assignHeading')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('roles.assignSubtitle', { n: users.length })}
          </p>
          <div className="mt-3 space-y-2">
            {users.map((u) => (
              <UserRoleEditor
                key={u.id}
                user={u}
                roles={roles}
                onChanged={(keys) =>
                  setUsers((prev) =>
                    prev.map((x) => (x.id === u.id ? { ...x, roles: keys } : x)),
                  )
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
