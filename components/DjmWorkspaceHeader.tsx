'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BrainCircuit,
  BriefcaseBusiness,
  Handshake,
  LayoutDashboard,
  LogOut,
  UsersRound,
} from 'lucide-react';

import Brand from '@/components/Brand';
import DjmGlobalSearch from '@/components/DjmGlobalSearch';
import DjmQuickCapture from '@/components/DjmQuickCapture';

const items = [
  { href: '/djm', label: 'Command', icon: LayoutDashboard },
  { href: '/admin', label: 'Players', icon: UsersRound },
  { href: '/market', label: 'Market', icon: BriefcaseBusiness },
  { href: '/deals', label: 'Deals', icon: Handshake },
  { href: '/brain', label: 'Brain', icon: BrainCircuit },
];

export default function DjmWorkspaceHeader({
  onSignOut,
}: {
  onSignOut: () => void | Promise<void>;
}) {
  const pathname = usePathname();

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

        <nav className="djm-os-product-nav" aria-label="DJM workspaces">
          {items.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/admin'
                ? pathname === '/admin' || pathname.startsWith('/admin/')
                : item.href === '/deals'
                  ? pathname === '/deals' || pathname.startsWith('/market/deals/')
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`djm-os-product-link ${active ? 'is-active' : ''}`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

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
