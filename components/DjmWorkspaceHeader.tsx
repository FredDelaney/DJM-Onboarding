'use client';

import {
  BrainCircuit,
  BriefcaseBusiness,
  ContactRound,
  Handshake,
  LayoutDashboard,
  LogOut,
  UsersRound,
} from 'lucide-react';

import Brand from '@/components/Brand';
import DjmGlobalSearch from '@/components/DjmGlobalSearch';
import DjmQuickCapture from '@/components/DjmQuickCapture';
import WorkspaceTabs, { type WorkspaceTab } from '@/components/WorkspaceTabs';

const items: WorkspaceTab[] = [
  { href: '/djm', label: 'Command', icon: LayoutDashboard },
  { href: '/admin', label: 'Players', icon: UsersRound },
  {
    href: '/network#contacts',
    label: 'Club Contacts',
    icon: ContactRound,
    activePrefixes: ['/network'],
  },
  { href: '/market', label: 'Market', icon: BriefcaseBusiness },
  {
    href: '/deals',
    label: 'Deals',
    icon: Handshake,
    activePrefixes: ['/deals', '/market/deals'],
  },
  { href: '/brain', label: 'Brain', icon: BrainCircuit },
];

export default function DjmWorkspaceHeader({
  onSignOut,
}: {
  onSignOut: () => void | Promise<void>;
}) {
  return (
    <header className="djm-os-header">
      <div className="djm-os-header-inner">
        <div className="djm-os-brand-row">
          <Brand />
          <span className="djm-os-chip">
            <BrainCircuit size={14} />
            Intelligence
          </span>
        </div>

        <WorkspaceTabs items={items} ariaLabel="DJM workspaces" />

        <div className="djm-os-button-row djm-os-header-actions">
          <DjmQuickCapture />
          <DjmGlobalSearch />
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
  );
}
