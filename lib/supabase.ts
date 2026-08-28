'use client';

import { createClient } from '@supabase/supabase-js';

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
  );
}

export const supabase = createClient(
  url,
  key,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export const publicFile = (
  bucket: string,
  path?: string | null,
) =>
  path
    ? supabase.storage
        .from(bucket)
        .getPublicUrl(path).data.publicUrl
    : '';

export const localDateISO = (
  date = new Date(),
) => {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');

  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseDisplayDate = (
  value: string,
) => {
  const dateOnly =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value,
    );

  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
  }

  return new Date(value);
};

export const fmtDate = (
  value?: string | null,
) => {
  if (!value) {
    return '—';
  }

  const date =
    parseDisplayDate(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'en-GB',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  ).format(date);
};

export const weekStartISO = () => {
  const date = new Date();

  const day =
    (date.getDay() + 6) % 7;

  date.setDate(
    date.getDate() - day,
  );

  return localDateISO(date);
};
