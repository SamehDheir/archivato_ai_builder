'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hasPermission, type AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { SupportNav } from '@/components/support/SupportNav';
import { AdminSupportDashboard } from '@/components/support/AdminSupportDashboard';

/** Support staff panel — self-guards on `support:read_all` (else back to /support). */
export default function SupportAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    authApi.me().then((me) => {
      if (!hasPermission(me?.permissions, 'support:read_all')) {
        router.replace('/support');
        return;
      }
      setUser(me);
    });
  }, [router]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <SupportNav canManageSupport />
      <AdminSupportDashboard />
    </div>
  );
}
