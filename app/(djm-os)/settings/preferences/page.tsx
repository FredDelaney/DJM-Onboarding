'use client';

import ConnectionsPanel from '@/components/ConnectionsPanel';
import { useAdmin } from '@/components/AdminShell';
import SettingsWorkspace from '@/components/SettingsWorkspace';

export default function PreferencesSettingsPage() {
  const auth = useAdmin();

  return (
    <SettingsWorkspace
      title="Preferences"
      description="Notifications and calendar preferences for your account."
    >
      <ConnectionsPanel
        userId={String(auth.user?.id || '')}
        email={String(auth.user?.email || '')}
        mode="staff"
        sections="preferences"
      />
    </SettingsWorkspace>
  );
}
