'use client';

import Link from 'next/link';
import {
  CreditCard,
  LogOut,
  PlugZap,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  Building2,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { publicFile, supabase } from '@/lib/supabase';
import styles from './AccountMenu.module.css';

type WorkspaceIdentity = {
  tenant_id?: string | null;
  role?: string | null;
  display_name?: string | null;
  short_name?: string | null;
  portal_name?: string | null;
};

type ProfileIdentity = {
  display_name?: string | null;
  avatar_path?: string | null;
  job_title?: string | null;
  email?: string | null;
};

const human = (value: unknown) =>
  String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'R';

export default function AccountMenu({
  workspace,
  onSignOut,
}: {
  workspace?: WorkspaceIdentity | null;
  onSignOut: () => void | Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileIdentity>({});

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;

      const { data: row } = await supabase
        .from('profiles')
        .select('display_name,avatar_path,job_title,email')
        .eq('id', data.user.id)
        .maybeSingle();

      if (!active) return;
      setProfile({
        display_name:
          row?.display_name ||
          data.user.user_metadata?.full_name ||
          data.user.email?.split('@')[0] ||
          'ReDream user',
        avatar_path: row?.avatar_path || null,
        job_title: row?.job_title || null,
        email: row?.email || data.user.email || null,
      });
    };

    const refreshProfile = () => {
      void loadProfile();
    };

    void loadProfile();
    window.addEventListener(
      'redream:profile-updated',
      refreshProfile,
    );

    return () => {
      active = false;
      window.removeEventListener(
        'redream:profile-updated',
        refreshProfile,
      );
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const close = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const name = profile.display_name || 'ReDream user';
  const role = String(workspace?.role || 'member');
  const agencyName =
    workspace?.display_name ||
    workspace?.short_name ||
    workspace?.portal_name ||
    'Agency workspace';

  const avatarUrl = useMemo(
    () => publicFile('player-public', profile.avatar_path),
    [profile.avatar_path],
  );
  const canManageAgency = ['owner', 'admin'].includes(role);
  const canManageBilling = role === 'owner';

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Open account and agency settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            initials(name)
          )}
        </span>
        <span className={styles.triggerCopy}>
          <strong>{name.split(' ')[0]}</strong>
          <small>{human(role)}</small>
        </span>
      </button>

      {open ? (
        <div className={styles.menu} role="menu">
          <div className={styles.identity}>
            <span className={styles.heroAvatar}>
              {avatarUrl ? <img src={avatarUrl} alt="" /> : initials(name)}
            </span>
            <div>
              <strong>{name}</strong>
              <span>{profile.job_title || human(role)}</span>
              <small>{agencyName}</small>
            </div>
          </div>

          <div className={styles.section}>
            <MenuLink href="/settings/profile" icon={<UserRound size={17} />} label="My profile" detail="Photo and personal details" />
            <MenuLink href="/settings/connections" icon={<PlugZap size={17} />} label="Connections" detail="Email, calendar and messaging" />
            <MenuLink href="/settings/security" icon={<ShieldCheck size={17} />} label="Security" detail="Password and account access" />
          </div>

          {canManageAgency ? (
            <div className={styles.section}>
              <p>Agency</p>
              <MenuLink href="/settings/team" icon={<UsersRound size={17} />} label="Team & access" detail="Invite and manage staff" />
              <MenuLink href="/settings/agency" icon={<Building2 size={17} />} label="Agency settings" detail="Identity, brand and workspace" />
              {canManageBilling ? (
                <MenuLink href="/settings/billing" icon={<CreditCard size={17} />} label="Plan & billing" detail="Plan, seats, invoices and payment" />
              ) : null}
            </div>
          ) : null}

          <div className={styles.footer}>
            <Link href="/settings" onClick={() => setOpen(false)}>
              <Settings2 size={16} />
              All settings
            </Link>
            <button
              type="button"
              onClick={() => void onSignOut()}
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <Link href={href} className={styles.item}>
      <span className={styles.itemIcon}>{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </Link>
  );
}
