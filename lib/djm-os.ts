'use client';

import { supabase } from '@/lib/supabase';

export async function djmRpc<T = any>(
  name: string,
  args: Record<string, any> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name as any, args as any);

  if (error) {
    throw new Error(error.message || `DJM request failed: ${name}`);
  }

  return data as T;
}

export async function djmInvoke<T = any>(
  functionName: string,
  body: FormData | Record<string, any>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(error.message || `DJM function failed: ${functionName}`);
  }

  return data as T;
}

export const compactDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const compactDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const initials = (value?: string | null) =>
  (value || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export const clampScore = (value?: number | null) =>
  Math.max(0, Math.min(100, Number(value || 0)));

export const friendlyError = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';
