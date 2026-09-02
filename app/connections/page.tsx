'use client';

import ConnectionsPanel from '@/components/ConnectionsPanel';
import { LoadingScreen, PlayerShell, usePlayerContext } from '@/components/PlayerShell';

export default function PlayerConnectionsPage() {
  const ctx = usePlayerContext();
  if (ctx.loading) return <LoadingScreen />;

  return (
    <PlayerShell inboxCount={ctx.openRequests.length}>
      <main className="ux-player-page">
        <section className="ux-player-page-heading">
          <span className="ux-kicker">MY DJM</span>
          <h1>Connections</h1>
          <p>Security, calendar and reminders in one place.</p>
        </section>
        <ConnectionsPanel
          userId={String(ctx.user?.id || '')}
          email={String(ctx.user?.email || '')}
          mode="player"
        />
      </main>
    </PlayerShell>
  );
}
