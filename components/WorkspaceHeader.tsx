'use client';

import {
  CalendarDays,
  ContactRound,
  Home,
  LogOut,
  Settings,
  Target,
  UserRound,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';

import Brand from '@/components/Brand';
import WorkspaceSearch from '@/components/WorkspaceSearch';
import QuickCapture from '@/components/QuickCapture';
import AiLauncher from '@/components/AiLauncher';
import WorkspaceTabs, {
  type WorkspaceTab,
} from '@/components/WorkspaceTabs';

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
}: {
  onSignOut: () => void | Promise<void>;
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

            <Link
              href="/settings"
              className="djm-os-icon-button"
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={17} />
            </Link>

            <button
              type="button"
              className="djm-os-icon-button"
              onClick={() => void onSignOut()}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
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
