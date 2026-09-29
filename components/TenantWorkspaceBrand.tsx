'use client';

import Link from 'next/link';

import { useTenantRuntime } from '@/components/TenantRuntimeProvider';
import styles from './TenantWorkspaceBrand.module.css';

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';

export default function TenantWorkspaceBrand({
  href = '/agency',
  compact = false,
  darkSurface = false,
}: {
  href?: string;
  compact?: boolean;
  darkSurface?: boolean;
}) {
  const runtime = useTenantRuntime();
  const branding = runtime.branding;
  const displayName = branding.display_name || 'Agency workspace';
  const label = branding.portal_name || branding.short_name || displayName;
  const regularLogo =
    branding.compact_logo_asset ||
    branding.logo_asset ||
    null;
  const lightOnlyLogo =
    !regularLogo && branding.light_logo_asset
      ? branding.light_logo_asset
      : null;
  const logo = regularLogo || lightOnlyLogo;

  return (
    <Link
      href={href}
      className={`${styles.root} ${compact ? styles.compact : ''} ${
        darkSurface ? styles.dark : ''
      }`}
      aria-label={`${displayName} workspace`}
    >
      <span
        className={`${styles.logoBox} ${lightOnlyLogo ? styles.lightLogoBox : ''}`}
      >
        {logo ? (
          <img src={logo} alt="" />
        ) : (
          <span className={styles.fallback}>{initials(displayName)}</span>
        )}
      </span>
      {!compact ? (
        <span className={styles.copy}>
          <strong>{label}</strong>
          <small>{displayName}</small>
        </span>
      ) : null}
    </Link>
  );
}
