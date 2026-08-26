'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BriefcaseBusiness,
  LogOut,
  Network,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react';

import Brand from '@/components/Brand';
import DjmGlobalSearch from '@/components/DjmGlobalSearch';
import DjmQuickCapture from '@/components/DjmQuickCapture';
import { useAdmin } from '@/components/AdminShell';
import { supabase } from '@/lib/supabase';

const items = [
  { href: '/djm', label: 'Home', icon: ShieldCheck },
  { href: '/admin', label: 'Signed Players', icon: UsersRound },
  { href: '/network', label: 'Network', icon: Network },
  { href: '/recruitment', label: 'Recruitment', icon: UserPlus },
  { href: '/market', label: 'Market', icon: BriefcaseBusiness },
];

export default function DjmOsShell({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  const auth = useAdmin();
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/sign-in');
  };

  if (auth.loading) {
    return (
      <main className="djm-os-loading">
        <Brand />
        <div className="djm-os-loading-line" />
        <span>Loading DJM OS…</span>
      </main>
    );
  }

  if (!auth.user) return null;

  return (
    <div className="djm-os-root">
      <header className="djm-os-header">
        <div className="djm-os-header-inner">
          <div className="djm-os-brand-row">
            <Brand />
            <span className="djm-os-chip">
              <ShieldCheck size={14} />
              DJM OS
            </span>
          </div>

          <nav className="djm-os-product-nav" aria-label="DJM workspaces">
            {items.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/admin'
                  ? pathname === '/admin' || pathname.startsWith('/admin/')
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

          <div className="djm-os-button-row">
            <DjmQuickCapture />
            <DjmGlobalSearch />
            <button type="button" className="djm-os-icon-button" onClick={signOut} aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="djm-os-main">
        <div className="djm-os-page-head">
          <div>
            <p className="djm-os-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>

          <div className="djm-os-user">
            <span>{auth.profile?.full_name || auth.user?.email || 'DJM'}</span>
            <small>{auth.profile?.role || 'team'}</small>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
