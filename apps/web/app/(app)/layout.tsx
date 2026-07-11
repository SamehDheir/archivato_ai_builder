import { AuthGate } from '@/components/auth/AuthGate';
import { ToastProvider } from '@/components/shared/toast';
import { ConfirmProvider } from '@/components/shared/confirm-dialog';
import { UpgradeProvider } from '@/components/billing/upgrade-dialog';

/**
 * Layout for the authenticated product (`/dashboard`, `/settings`, `/admin`,
 * `/support`, plus the auth pages `/login`, `/register`, `/verify`).
 *
 * The app's whole provider stack + `AuthGate` live here rather than in the root
 * layout, and that split is a **performance boundary**, not just tidiness: with
 * these in the root layout the public marketing page had to download and hydrate
 * the entire authenticated app — the auth form, the account menu, the
 * notification bell, and the billing/upgrade dialog — before it could paint. That
 * was the bulk of the landing page's unused JavaScript and its blocking time.
 *
 * Route groups don't affect URLs, so every path here is unchanged.
 *
 * Keep marketing/legal routes OUT of this group; they must stay lean.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <UpgradeProvider>
          <AuthGate>{children}</AuthGate>
        </UpgradeProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
