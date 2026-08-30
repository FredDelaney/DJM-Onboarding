'use client';

import { useParams } from 'next/navigation';

import { AdminShell } from '@/components/AdminShell';
import PlayerComparisonExplorer from '@/components/PlayerComparisonExplorer';

export default function PlayerComparePage() {
  const { id } = useParams<{ id: string }>();

  return (
    <AdminShell>
      <main className="ux-compare-page">
        <PlayerComparisonExplorer playerId={id} />
      </main>
    </AdminShell>
  );
}
