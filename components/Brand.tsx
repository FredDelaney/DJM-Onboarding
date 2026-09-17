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

  const displayName =
    branding.display_name.trim();

  const shortName =
    branding.short_name?.trim() ||
    null;

  const portalName =
    branding.portal_name?.trim() ||
    null;

  const logoAsset =
    (light
      ? branding.light_logo_asset
      : null) ||
    (compact
      ? branding.compact_logo_asset
      : null) ||
    branding.logo_asset;

  const logoSrc =
    logoAsset || null;

  const markText = (
    shortName ||
    displayName ||
    'Agency'
  )
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const primaryLabel = (
    portalName ||
    shortName ||
    displayName
  ).toUpperCase();

  const secondaryLabel =
    shortName &&
    displayName
      .toLowerCase()
      .startsWith(
        `${shortName.toLowerCase()} `,
      )
      ? displayName
          .slice(shortName.length)
          .trim()
          .toUpperCase()
      : displayName.toUpperCase();

  return (
    <Link
      href="/"
      className={`brand ${
        light ? 'brand-light' : ''
      }`}
      aria-label={
        displayName
      }
    >
      <span className="brand-mark">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={displayName}
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
