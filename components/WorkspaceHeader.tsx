'use client';

import {
  CalendarDays,
  ContactRound,
  Home,
  Target,
  UserRound,
  UsersRound,
} from 'lucide-react';

import Brand from '@/components/Brand';
import WorkspaceSearch from '@/components/WorkspaceSearch';
import QuickCapture from '@/components/QuickCapture';
import AiLauncher from '@/components/AiLauncher';
import WorkspaceTabs, {
  type WorkspaceTab,
} from '@/components/WorkspaceTabs';
import AccountMenu from '@/components/AccountMenu';

const items: WorkspaceTab[] = [
  {
    href: '/agency',
    label: 'Home',
    icon: Home,
    activeView: null,
  },
  {
    href: '/agency?view=players',
    label: 'Players',
    icon: UsersRound,
    activeView: 'players',
  },
  {
    href: '/agency?view=opportunities',
    label: 'Opportunities',
    icon: Target,
    activeView: 'opportunities',
  },
  {
    href: '/agency?view=network',
    label: 'Network',
    icon: ContactRound,
    activeView: 'network',
  },
  {
    href: '/agency?view=calendar',
    label: 'Calendar',
    icon: CalendarDays,
    activeView: 'calendar',
  },
];

export default function WorkspaceHeader({
  onSignOut,
  workspace,
}: {
  onSignOut: () => void | Promise<void>;
  workspace?: {
    tenant_id?: string | null;
    role?: string | null;
    display_name?: string | null;
    short_name?: string | null;
    portal_name?: string | null;
  } | null;
}) {
  return (
    <>
      <header className="djm-os-header ux-staff-header">
        <div className="djm-os-header-inner">
          <div className="djm-os-brand-row">
            <Brand />
            <span className="djm-os-chip ux-os-chip">
              <UserRound size={14} />
              Workspace
            </span>
          </div>

          <WorkspaceTabs
            items={items}
            ariaLabel="Agency workspace"
            className="djm-desktop-workspace-nav"
          />

          <div className="djm-os-button-row djm-os-header-actions">
            <AiLauncher />
            <QuickCapture />
            <WorkspaceSearch />

            <AccountMenu
              workspace={workspace}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      </header>

      <WorkspaceTabs
        items={items}
        ariaLabel="Agency mobile workspace"
        className="djm-mobile-workspace-nav"
      />
    </>
  );
}
