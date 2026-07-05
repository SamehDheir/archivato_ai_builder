'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { SupportNav } from '@/components/support/SupportNav';
import { AdminSupportDashboard } from '@/components/support/AdminSupportDashboard';

/** Admin Support Panel — self-guards (non-admins bounce to the customer view). */
export default function SupportAdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    authApi.me().then((me) => {
      if (!me || me.role !== 'admin') {
        router.replace('/support');
        return;
      }
      setUser(me);
    });
  }, [router]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <SupportNav isAdmin />
      <AdminSupportDashboard />
    </div>
  );
}
