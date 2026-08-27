'use client';

import { useRouter } from 'next/navigation';
import Brand from '@/components/Brand';
import DjmWorkspaceHeader from '@/components/DjmWorkspaceHeader';
import { useAdmin } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';


export default function DjmOsShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  const auth = useAdmin();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  if (auth.loading) {
    return (
      <main className="djm-os-loading">
        <Brand />
        <div className="djm-os-loading-line" />
        <span>Loading DJM OS…</span>
      </main>
    );
  }

  if (!auth.user) return null;

  return (
    <div className="djm-os-root">
      <DjmWorkspaceHeader onSignOut={signOut} />

      <main className="djm-os-main">
        <div className="djm-os-page-head">
          <div>
            <p className="djm-os-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>

          <div className="djm-os-user">
            <span>{auth.profile?.full_name || auth.user?.email || 'DJM'}</span>
            <small>{auth.profile?.role || 'team'}</small>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
