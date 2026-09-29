'use client';

import { useState } from 'react';

import { useAdmin } from '@/components/AdminShell';
import AgencyConnectedIdentityResolverDrawer from '@/components/AgencyConnectedIdentityResolverDrawer';
import AgencyConnectionsDrawer from '@/components/AgencyConnectionsDrawer';
import SettingsWorkspace from '@/components/SettingsWorkspace';

export default function StaffConnectionsPage() {
  const auth = useAdmin();
  const [reviewingIdentities, setReviewingIdentities] = useState(false);
  const workspaceSlug = String(auth.workspace?.slug || '');

  return (
    <SettingsWorkspace
      title="Connections"
      description={
        reviewingIdentities
          ? 'Confirm who selected conversations belong to.'
          : 'Connect the services ReDream can use for your agency work.'
      }
    >
      {!workspaceSlug ? (
        <div className="ux-mini-empty">Agency workspace is not available.</div>
      ) : reviewingIdentities ? (
        <AgencyConnectedIdentityResolverDrawer
          presentation="page"
          workspaceSlug={workspaceSlug}
          networkHref="/agency?view=network"
          onClose={() => setReviewingIdentities(false)}
        />
      ) : (
        <AgencyConnectionsDrawer
          presentation="page"
          workspaceSlug={workspaceSlug}
          onClose={() => undefined}
          onResolveIdentities={() => setReviewingIdentities(true)}
        />
      )}
    </SettingsWorkspace>
  );
}
