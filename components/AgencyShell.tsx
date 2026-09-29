'use client';

import { useRouter } from 'next/navigation';
import Brand from '@/components/Brand';
import WorkspaceHeader from '@/components/WorkspaceHeader';
import { useAdmin } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

export default function AgencyShell({
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
  const pageKey = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  if (auth.loading) {
    return (
      <main className="djm-os-loading">
        <Brand />
        <div className="djm-os-loading-line" />
        <span>Loading ReDream...</span>
      </main>
    );
  }

  if (!auth.user) return null;

  return (
    <div className="djm-os-root" data-djm-page={pageKey}>
      <WorkspaceHeader
        workspace={auth.workspace}
        onSignOut={signOut}
      />

      <main className="djm-os-main">
        <div className="djm-os-page-head">
          <div>
            <p className="djm-os-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
