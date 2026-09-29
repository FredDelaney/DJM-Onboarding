'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CreditCard,
  PlugZap,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';

import AgencyShell from '@/components/AgencyShell';
import { useAdmin } from '@/components/AdminShell';

export default function SettingsPage() {
  const auth = useAdmin();
  const tenantRole = String(
    auth.workspace?.role ||
    auth.profile?.tenant_role ||
    '',
  );
  const workspaceName =
    auth.workspace?.display_name ||
    auth.workspace?.short_name ||
    auth.workspace?.portal_name ||
    'this agency';
  const canManageAgency = ['owner', 'admin'].includes(tenantRole);
  const canManageBilling = tenantRole === 'owner';

  return (
    <AgencyShell eyebrow="Account & agency" title="Settings">
      <section className="ux-settings-hero">
        <div>
          <p className="ux-eyebrow">CURRENT WORKSPACE</p>
          <h2>{workspaceName}</h2>
          <p>
            Your profile, connections and security belong to you. Team,
            agency and billing controls follow your role in this workspace.
          </p>
        </div>
        <div className="djm-os-chip">{humanRole(tenantRole)}</div>
      </section>

      <p className="ux-eyebrow">YOU</p>
      <section className="ux-settings-grid">
        <SettingsCard
          icon={<UserRound size={20} />}
          title="My profile"
          text="Profile photo, name, job title, phone, language and timezone."
          meta="Personal to your ReDream account"
          href="/settings/profile"
          action="Edit profile"
        />
        <SettingsCard
          icon={<PlugZap size={20} />}
          title="Connections"
          text="Manage the email, calendar and messaging services connected to your account."
          meta="Your connected work"
          href="/settings/connections"
          action="Manage connections"
        />
        <SettingsCard
          icon={<ShieldCheck size={20} />}
          title="Security"
          text="Manage your password and the current signed-in session."
          meta="Your sign-in security"
          href="/settings/security"
          action="Open security"
        />
      </section>

      {canManageAgency ? (
        <>
          <p className="ux-eyebrow">YOUR AGENCY</p>
          <section className="ux-settings-grid">
            <SettingsCard
              icon={<UsersRound size={20} />}
              title="Team & access"
              text="Invite agents and staff, manage roles and control workspace access."
              meta="Owner and admin controlled"
              href="/settings/team"
              action="Manage team"
            />
            <SettingsCard
              icon={<Building2 size={20} />}
              title="Agency settings"
              text="Manage the agency identity, workspace name, contact details and brand colours."
              meta={tenantRole === 'owner' ? 'Owner controlled' : 'Owner controlled, viewable by admin'}
              href="/settings/agency"
              action="Open agency settings"
            />
          </section>
        </>
      ) : null}

      {canManageBilling ? (
        <>
          <p className="ux-eyebrow">YOUR REDREAM ACCOUNT</p>
          <section className="ux-settings-grid">
            <SettingsCard
              icon={<CreditCard size={20} />}
              title="Plan & billing"
              text="See usage, change plan, manage billing details, payment methods and invoices."
              meta="Agency owner only"
              href="/settings/billing"
              action="Manage plan & billing"
            />
          </section>
        </>
      ) : null}

      <section className="ux-surface ux-settings-principle">
        <div>
          <p className="ux-eyebrow">ACCESS RULE</p>
          <h2>Your role controls what appears here.</h2>
        </div>
        <p>
          ReDream keeps personal settings separate from agency administration.
          Being an agent in one agency never gives you administration rights in another.
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
    <Link className="ux-settings-card" href={href}>
      <div className="ux-settings-icon">{icon}</div>
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
  if (value === 'operations') return 'Operations';
  if (value === 'admin') return 'Admin';
  if (value === 'agent') return 'Agent';
  if (value === 'scout') return 'Scout';
  if (value === 'owner') return 'Owner';
  return 'Agency member';
}
