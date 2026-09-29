'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Building2,
  CreditCard,
  LayoutGrid,
  PlugZap,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react';

import AgencyShell from '@/components/AgencyShell';
import { useAdmin } from '@/components/AdminShell';
import styles from './SettingsWorkspace.module.css';

type SettingsItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

export default function SettingsWorkspace({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const auth = useAdmin();
  const pathname = usePathname() || '/settings';
  const role = String(
    auth.workspace?.role ||
    auth.profile?.tenant_role ||
    '',
  );
  const canManageAgency = ['owner', 'admin'].includes(role);
  const canManageBilling = role === 'owner';
  const canManagePlayerExperience = auth.profile?.role === 'admin';
  const workspaceName =
    auth.workspace?.display_name ||
    auth.workspace?.short_name ||
    auth.workspace?.portal_name ||
    'Agency workspace';

  const personal: SettingsItem[] = [
    { href: '/settings/profile', label: 'My profile', icon: <UserRound size={16} /> },
    { href: '/settings/preferences', label: 'Preferences', icon: <Bell size={16} /> },
    { href: '/settings/connections', label: 'Connections', icon: <PlugZap size={16} /> },
    { href: '/settings/security', label: 'Security', icon: <ShieldCheck size={16} /> },
  ];
  const agency: SettingsItem[] = canManageAgency
    ? [
        { href: '/settings/team', label: 'Team & access', icon: <UsersRound size={16} /> },
        { href: '/settings/agency', label: 'Agency settings', icon: <Building2 size={16} /> },
        ...(canManagePlayerExperience
          ? [{ href: '/settings/player-experience', label: 'Player experience', icon: <BookOpen size={16} /> }]
          : []),
      ]
    : [];
  const account: SettingsItem[] = canManageBilling
    ? [
        { href: '/settings/billing', label: 'Plan & billing', icon: <CreditCard size={16} /> },
      ]
    : [];

  return (
    <AgencyShell eyebrow="Settings" title={title}>
      <div className={styles.workspace}>
        <aside className={styles.rail} aria-label="Settings navigation">
          <Link href="/agency" className={styles.back}>
            <ArrowLeft size={14} />
            Back to workspace
          </Link>

          <div className={styles.workspaceIdentity}>
            <strong>{workspaceName}</strong>
            <span>{humanRole(role)}</span>
          </div>

          <nav className={styles.nav}>
            <SettingsLink
              item={{ href: '/settings', label: 'Overview', icon: <LayoutGrid size={16} /> }}
              current={pathname === '/settings'}
            />

            <SettingsGroup label="You" items={personal} pathname={pathname} />
            {agency.length ? (
              <SettingsGroup label="Agency" items={agency} pathname={pathname} />
            ) : null}
            {account.length ? (
              <SettingsGroup label="ReDream" items={account} pathname={pathname} />
            ) : null}
          </nav>
        </aside>

        <section className={styles.content}>
          {description ? (
            <p className={styles.description}>{description}</p>
          ) : null}
          {children}
        </section>
      </div>
    </AgencyShell>
  );
}

function SettingsGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: SettingsItem[];
  pathname: string;
}) {
  return (
    <div className={styles.group}>
      <p>{label}</p>
      {items.map((item) => (
        <SettingsLink
          key={item.href}
          item={item}
          current={pathname === item.href}
        />
      ))}
    </div>
  );
}

function SettingsLink({
  item,
  current,
}: {
  item: SettingsItem;
  current: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`${styles.link} ${current ? styles.current : ''}`}
      aria-current={current ? 'page' : undefined}
    >
      {item.icon}
      <span>{item.label}</span>
    </Link>
  );
}

function humanRole(value: string) {
  if (value === 'owner') return 'Owner';
  if (value === 'admin') return 'Admin';
  if (value === 'agent') return 'Agent';
  if (value === 'scout') return 'Scout';
  if (value === 'operations') return 'Operations';
  return 'Agency member';
}
