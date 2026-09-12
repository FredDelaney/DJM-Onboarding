'use client';

import Link from 'next/link';

import {
  useTenantRuntime,
} from './TenantRuntimeProvider';

export default function Brand({
  light = false,
  compact = false,
}: {
  light?: boolean;
  compact?: boolean;
}) {
  const runtime =
    useTenantRuntime();

  const branding =
    runtime.branding;

  const isDjm =
    runtime.slug ===
    'djm-sports-management';

  const logoAsset =
    (light
      ? branding.light_logo_asset
      : null) ||
    (compact
      ? branding.compact_logo_asset
      : null) ||
    branding.logo_asset;

  const logoSrc =
    logoAsset ||
    (isDjm
      ? '/djm-mark.png'
      : null);

  const markText = (
    branding.short_name ||
    branding.display_name ||
    'Agency'
  )
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const primaryLabel = isDjm
    ? 'DJM PLAYER'
    : (
        branding.portal_name ||
        branding.short_name ||
        branding.display_name
      ).toUpperCase();

  const secondaryLabel = isDjm
    ? 'SPORTS MANAGEMENT'
    : branding.display_name.toUpperCase();

  return (
    <Link
      href="/"
      className={`brand ${
        light ? 'brand-light' : ''
      }`}
      aria-label={
        branding.display_name
      }
    >
      <span className="brand-mark">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={
              branding.display_name
            }
          />
        ) : (
          <span
            className="tenant-lettermark"
            aria-hidden="true"
          >
            {markText}
          </span>
        )}
      </span>

      {!compact && (
        <span className="brand-copy">
          {primaryLabel}
          <small>
            {secondaryLabel}
          </small>
        </span>
      )}
    </Link>
  );
}
