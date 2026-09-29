'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  Building2,
  CreditCard,
  PlugZap,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';

import { useAdmin } from '@/components/AdminShell';
import SettingsWorkspace from '@/components/SettingsWorkspace';

export default function SettingsPage() {
  const auth = useAdmin();
  const role = String(
    auth.workspace?.role ||
    auth.profile?.tenant_role ||
    '',
  );
  const canManageAgency = ['owner', 'admin'].includes(role);
  const canManageBilling = role === 'owner';

  return (
    <SettingsWorkspace
      title="Settings"
      description="Manage your account and agency in one place."
    >
      <section className="ux-settings-grid">
        <SettingsCard
          icon={<UserRound size={19} />}
          title="My profile"
          text="Photo, name and preferences."
          href="/settings/profile"
        />
        <SettingsCard
          icon={<Bell size={19} />}
          title="Preferences"
          text="Notifications and calendar."
          href="/settings/preferences"
        />
        <SettingsCard
          icon={<PlugZap size={19} />}
          title="Connections"
          text="Email, calendar and messaging."
          href="/settings/connections"
        />
        <SettingsCard
          icon={<ShieldCheck size={19} />}
          title="Security"
          text="Password and sign-in."
          href="/settings/security"
        />
        {canManageAgency ? (
          <>
            <SettingsCard
              icon={<UsersRound size={19} />}
              title="Team & access"
              text="Invite people and manage roles."
              href="/settings/team"
            />
            <SettingsCard
              icon={<Building2 size={19} />}
              title="Agency settings"
              text="Agency details and branding."
              href="/settings/agency"
            />
          </>
        ) : null}
        {canManageBilling ? (
          <SettingsCard
            icon={<CreditCard size={19} />}
            title="Plan & billing"
            text="Plan, usage, invoices and payment."
            href="/settings/billing"
          />
        ) : null}
      </section>
    </SettingsWorkspace>
  );
}

function SettingsCard({
  icon,
  title,
  text,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  href: string;
}) {
  return (
    <Link className="ux-settings-card" href={href}>
      <div className="ux-settings-icon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <span aria-hidden="true">
        <ArrowRight size={15} />
      </span>
    </Link>
  );
}
