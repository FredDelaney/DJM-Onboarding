'use client';

import {
  BriefcaseBusiness,
  ContactRound,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';

import Brand from '@/components/Brand';
import WorkspaceSearch from '@/components/WorkspaceSearch';
import QuickCapture from '@/components/QuickCapture';
import AiLauncher from '@/components/AiLauncher';
import WorkspaceTabs, { type WorkspaceTab } from '@/components/WorkspaceTabs';

const items: WorkspaceTab[] = [
  { href: '/djm', label: 'Home', icon: LayoutDashboard },
  {
    href: '/admin',
    label: 'Players',
    icon: UsersRound,
    activePrefixes: ['/admin', '/recruitment'],
  },
  {
    href: '/opportunities',
    label: 'Opportunities',
    icon: BriefcaseBusiness,
    activePrefixes: ['/opportunities', '/market', '/deals'],
  },
  {
    href: '/network',
    label: 'Network',
    icon: ContactRound,
    activePrefixes: ['/network'],
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
            ariaLabel="Agency workspaces"
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
        ariaLabel="Agency mobile workspaces"
        className="djm-mobile-workspace-nav"
      />
    </>
  );
}
