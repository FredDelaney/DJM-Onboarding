'use client';

import { UserRound } from 'lucide-react';

import styles from './AgencyOwnershipChip.module.css';

export default function AgencyOwnershipChip({
  label,
  name,
  emptyText = 'Unassigned',
  attention = false,
}: {
  label: string;
  name?: string | null;
  emptyText?: string;
  attention?: boolean;
}) {
  const value = String(name || '').trim();
  const missing = !value;

  return (
    <span
      className={
        missing || attention
          ? styles.attention
          : styles.chip
      }
      aria-label={
        label +
        ': ' +
        (value || emptyText)
      }
    >
      <UserRound size={12} />
      <small>{label}</small>
      <strong>{value || emptyText}</strong>
    </span>
  );
}
