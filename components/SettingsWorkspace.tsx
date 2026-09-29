'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  Coins,
  CreditCard,
  Home as HomeIcon,
  LayoutGrid,
  LogOut,
  Network,
  PlugZap,
  ShieldCheck,
  Target,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react';

import AccountMenu from '@/components/AccountMenu';
import AiLauncher from '@/components/AiLauncher';
import { useAdmin } from '@/components/AdminShell';
import TenantWorkspaceBrand from '@/components/TenantWorkspaceBrand';
import { useTenantRuntime } from '@/components/TenantRuntimeProvider';
import { tenantBrandCssVariables } from '@/lib/tenant-brand-style';
import { supabase } from '@/lib/supabase';
import shellStyles from './AgencyOperatingWorkspace.module.css';
import styles from './SettingsWorkspace.module.css';

type SettingsItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

type MainNavItem = {
  key: 'home' | 'players' | 'opportunities' | 'network' | 'calendar' | 'business';
  label: string;
  icon: typeof Target;
};

const MAIN_NAV: MainNavItem[] = [
  { key: 'home', label: 'Home', icon: HomeIcon },
  { key: 'players', label: 'Players', icon: Users },
  { key: 'opportunities', label: 'Opportunities', icon: Target },
  { key: 'network', label: 'Network', icon: Network },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'business', label: 'Business', icon: Coins },
];

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
  const runtime = useTenantRuntime();
  const router = useRouter();
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
    runtime.branding.display_name ||
    'Agency workspace';
  const navigation = MAIN_NAV.filter(
    (item) => item.key !== 'business' || canManageAgency,
  );
  const theme = tenantBrandCssVariables({
    primary: runtime.branding.primary_color,
    secondary: runtime.branding.secondary_color,
    accent: runtime.branding.accent_color,
  });

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

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  if (auth.loading || !auth.user || !auth.workspace) return null;

  return (
    <div
      className={shellStyles.root}
      style={theme}
      data-settings-shell="agency-workspace"
    >
      <aside className={shellStyles.sidebar}>
        <div className={shellStyles.brand}>
          <TenantWorkspaceBrand href="/agency" darkSurface />
        </div>

        <nav className={shellStyles.nav} aria-label="Agency workspace">
          {navigation.map((item) => {
            const Icon = item.icon;
            const href =
              item.key === 'home'
                ? '/agency'
                : `/agency?view=${item.key}`;
            return (
              <Link
                key={item.key}
                href={href}
                className={item.key === 'business' ? shellStyles.navManagement : ''}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={shellStyles.sidebarFoot}>
          <div>
            <span>{humanRole(role)}</span>
          </div>
          <button type="button" onClick={() => void signOut()}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      <main className={shellStyles.main}>
        <header className={shellStyles.pageHead}>
          <div className={shellStyles.mobileTenantBrand}>
            <TenantWorkspaceBrand href="/agency" compact />
          </div>
          <div className={shellStyles.pageHeadCopy}>
            <div className={shellStyles.pageHeadTitleLine}>
              <div>
                <h1>{title}</h1>
              </div>
            </div>
            {description ? (
              <p className={shellStyles.pageDescription}>{description}</p>
            ) : null}
          </div>
          <div className={shellStyles.desktopHeadActions}>
            <AiLauncher />
            <AccountMenu workspace={auth.workspace} onSignOut={signOut} />
          </div>
          <div className={shellStyles.mobileHeadActions}>
            <AccountMenu workspace={auth.workspace} onSignOut={signOut} />
          </div>
        </header>

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

          <section className={styles.content}>{children}</section>
        </div>
      </main>

      <div className={shellStyles.mobileTell}>
        <AiLauncher />
      </div>
    </div>
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
