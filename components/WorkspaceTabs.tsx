'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

export type WorkspaceTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  activePrefixes?: string[];
  badge?: number;
};

const isActiveTab = (pathname: string, item: WorkspaceTab) => {
  const prefixes = item.activePrefixes?.length
    ? item.activePrefixes
    : [item.href.split('#')[0]];

  return prefixes.some((prefix) => {
    if (!prefix) return false;
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
};

export default function WorkspaceTabs({
  items,
  ariaLabel,
  className = '',
}: {
  items: WorkspaceTab[];
  ariaLabel: string;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={`djm-os-product-nav ${className}`.trim()}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActiveTab(pathname, item);
        const badge = Number(item.badge || 0);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            aria-current={active ? 'page' : undefined}
            className={`djm-os-product-link ${active ? 'is-active' : ''}`}
          >
            <Icon size={16} />
            <span>{item.label}</span>
            {badge > 0 ? (
              <span className="workspace-tab-badge" aria-label={`${badge} open`}>
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
