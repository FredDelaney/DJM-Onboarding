'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react';

import AgencyShell from '@/components/AgencyShell';
import { useAdmin } from '@/components/AdminShell';

export default function SettingsPage() {
  const auth = useAdmin();

  const tenantRole = String(
    auth.profile?.tenant_role || '',
  );

  const workspaceName =
    auth.workspace?.display_name ||
    auth.workspace?.short_name ||
    auth.workspace?.portal_name ||
    'this agency';

  const canManageTeam = [
    'owner',
    'admin',
  ].includes(tenantRole);

  return (
    <AgencyShell
      eyebrow="Agency administration"
      title="Settings"
    >
      <section className="ux-settings-hero">
        <div>
          <p className="ux-eyebrow">
            CURRENT WORKSPACE
          </p>

          <h2>{workspaceName}</h2>

          <p>
            Permissions, player data,
            resources and operating tools
            are scoped to this agency.
          </p>
        </div>

        <div className="djm-os-chip">
          {humanRole(tenantRole)}
        </div>
      </section>

      <section className="ux-settings-grid">
        <SettingsCard
          icon={
            <UsersRound
              size={20}
            />
          }
          title="Team & permissions"
          text="Invite staff, manage agency roles and control scout player assignments."
          meta={
            canManageTeam
              ? 'Owner and admin controlled'
              : 'Owner or admin access required'
          }
          href="/settings/team"
          action="Manage team"
        />

        <SettingsCard
          icon={
            <ShieldCheck
              size={20}
            />
          }
          title="Player experience"
          text="Manage player resources and meaningful agency announcements for this workspace."
          meta="Tenant-owned player content"
          href="/settings/player-experience"
          action="Manage player experience"
        />

        <SettingsCard
          icon={
            <CalendarClock
              size={20}
            />
          }
          title="Connections"
          text="Manage calendar, notifications, account security and connected services."
          meta="Workspace connections"
          href="/settings/connections"
          action="Manage connections"
        />

        <SettingsCard
          icon={
            <SlidersHorizontal
              size={20}
            />
          }
          title="Agency workspace"
          text="Return to the shared ReDream operating workspace used by every agency."
          meta="One product, tenant-specific data"
          href="/agency"
          action="Open workspace"
        />
      </section>

      <section className="ux-surface ux-settings-principle">
        <div>
          <p className="ux-eyebrow">
            ACCESS RULE
          </p>

          <h2>
            Agency access comes from
            agency membership.
          </h2>
        </div>

        <p>
          ReDream does not use a global
          staff role to decide who can
          operate a customer workspace.
          Your role in one agency does
          not grant access to another.
        </p>
      </section>
    </AgencyShell>
  );
}

function SettingsCard({
  icon,
  title,
  text,
  meta,
  href,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  meta: string;
  href: string;
  action: string;
}) {
  return (
    <Link
      className="ux-settings-card"
      href={href}
    >
      <div className="ux-settings-icon">
        {icon}
      </div>

      <div>
        <strong>{title}</strong>
        <p>{text}</p>
        <small>{meta}</small>
      </div>

      <span>
        {action}
        <ArrowRight size={15} />
      </span>
    </Link>
  );
}

function humanRole(value: string) {
  if (value === 'operations') {
    return 'Operations';
  }

  if (value === 'admin') {
    return 'Admin';
  }

  if (value === 'agent') {
    return 'Agent';
  }

  if (value === 'scout') {
    return 'Scout';
  }

  if (value === 'owner') {
    return 'Owner';
  }

  return 'Agency member';
}
