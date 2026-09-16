'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import ConnectionsPanel from '@/components/ConnectionsPanel';
import AgencyShell from '@/components/AgencyShell';
import { useAdmin } from '@/components/AdminShell';

export default function StaffConnectionsPage() {
  const auth = useAdmin();

  return (
    <AgencyShell eyebrow="Settings · your account" title="Connections">
      <Link href="/settings" className="ux-back-link"><ArrowLeft size={15} />Settings</Link>
      <ConnectionsPanel
        userId={String(auth.user?.id || '')}
        email={String(auth.user?.email || '')}
        mode="staff"
      />
    </AgencyShell>
  );
}
