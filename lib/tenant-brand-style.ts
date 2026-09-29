import type { CSSProperties } from 'react';

const HEX = /^#[0-9a-f]{6}$/i;

const cleanHex = (value: unknown, fallback: string) => {
  const candidate = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return HEX.test(candidate) ? candidate : fallback;
};

const rgb = (hex: string) => ({
  r: Number.parseInt(hex.slice(1, 3), 16),
  g: Number.parseInt(hex.slice(3, 5), 16),
  b: Number.parseInt(hex.slice(5, 7), 16),
});

const toHex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

export const mixBrandColour = (
  from: string,
  to: string,
  amount: number,
) => {
  const start = rgb(cleanHex(from, '#111827'));
  const end = rgb(cleanHex(to, '#FFFFFF'));
  const weight = Math.max(0, Math.min(1, amount));

  return `#${toHex(start.r + (end.r - start.r) * weight)}${toHex(
    start.g + (end.g - start.g) * weight,
  )}${toHex(start.b + (end.b - start.b) * weight)}`;
};

const linear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
};

export const brandLuminance = (hex: string) => {
  const value = rgb(cleanHex(hex, '#111827'));
  return (
    0.2126 * linear(value.r) +
    0.7152 * linear(value.g) +
    0.0722 * linear(value.b)
  );
};

export const brandContrastRatio = (first: string, second: string) => {
  const a = brandLuminance(first);
  const b = brandLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
};

export const readableBrandInk = (
  colour: string,
  background = '#FFFFFF',
  minimum = 4.5,
) => {
  const original = cleanHex(colour, '#111827');
  const bg = cleanHex(background, '#FFFFFF');

  if (brandContrastRatio(original, bg) >= minimum) return original;

  // Brand colours that are too light remain available as raw decorative tokens,
  // while the UI ink version is progressively darkened until it is readable.
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixBrandColour(original, '#000000', step * 0.04);
    if (brandContrastRatio(candidate, bg) >= minimum) return candidate;
  }

  return brandContrastRatio('#111827', bg) >= minimum ? '#111827' : '#FFFFFF';
};

export const foregroundForBrandColour = (background: string) => {
  const bg = cleanHex(background, '#111827');
  const white = brandContrastRatio('#FFFFFF', bg);
  const dark = brandContrastRatio('#111827', bg);
  return white >= dark ? '#FFFFFF' : '#111827';
};

export type TenantBrandTokens = {
  primaryRaw: string;
  secondaryRaw: string;
  accentRaw: string;
  primary: string;
  accent: string;
  surface: string;
  onPrimary: string;
  onPrimaryRaw: string;
  onSecondary: string;
  onAccent: string;
  onAccentRaw: string;
  primarySoft: string;
  accentSoft: string;
};

export function tenantBrandTokens({
  primary,
  secondary,
  accent,
}: {
  primary?: unknown;
  secondary?: unknown;
  accent?: unknown;
}): TenantBrandTokens {
  const primaryRaw = cleanHex(primary, '#111827');
  const secondaryRaw = cleanHex(secondary, '#FFFFFF');
  const accentRaw = cleanHex(accent, '#64748B');
  const surface = brandLuminance(secondaryRaw) >= 0.72 ? secondaryRaw : '#FFFFFF';
  const safePrimary = readableBrandInk(primaryRaw, '#FFFFFF');
  const safeAccent = readableBrandInk(accentRaw, '#FFFFFF');

  return {
    primaryRaw,
    secondaryRaw,
    accentRaw,
    primary: safePrimary,
    accent: safeAccent,
    surface,
    onPrimary: foregroundForBrandColour(safePrimary),
    onPrimaryRaw: foregroundForBrandColour(primaryRaw),
    onSecondary: foregroundForBrandColour(surface),
    onAccent: foregroundForBrandColour(safeAccent),
    onAccentRaw: foregroundForBrandColour(accentRaw),
    primarySoft: mixBrandColour(primaryRaw, '#FFFFFF', 0.91),
    accentSoft: mixBrandColour(accentRaw, '#FFFFFF', 0.88),
  };
}

export type TenantBrandCssProperties = CSSProperties & Record<`--${string}`, string>;

export function tenantBrandCssVariables({
  primary,
  secondary,
  accent,
}: {
  primary?: unknown;
  secondary?: unknown;
  accent?: unknown;
}): TenantBrandCssProperties {
  const tokens = tenantBrandTokens({ primary, secondary, accent });

  return {
    '--tenant-primary': tokens.primary,
    '--tenant-secondary': tokens.surface,
    '--tenant-accent': tokens.accent,
    '--tenant-primary-raw': tokens.primaryRaw,
    '--tenant-secondary-raw': tokens.secondaryRaw,
    '--tenant-accent-raw': tokens.accentRaw,
    '--tenant-on-primary': tokens.onPrimary,
    '--tenant-on-primary-raw': tokens.onPrimaryRaw,
    '--tenant-on-secondary': tokens.onSecondary,
    '--tenant-on-accent': tokens.onAccent,
    '--tenant-on-accent-raw': tokens.onAccentRaw,
    '--tenant-primary-soft': tokens.primarySoft,
    '--tenant-accent-soft': tokens.accentSoft,
    '--agency-primary': tokens.primary,
    '--agency-accent': tokens.accent,
    '--agency-primary-raw': tokens.primaryRaw,
    '--agency-accent-raw': tokens.accentRaw,
    '--agency-on-primary': tokens.onPrimary,
    '--agency-on-primary-raw': tokens.onPrimaryRaw,
    '--agency-on-secondary': tokens.onSecondary,
    '--agency-on-accent': tokens.onAccent,
    '--agency-primary-soft': tokens.primarySoft,
    '--agency-accent-soft': tokens.accentSoft,
  };
}
