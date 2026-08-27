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
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    let message = error.message || `DJM function failed: ${functionName}`;
    const context = (error as any)?.context;

    if (context && typeof context.clone === 'function') {
      try {
        const response = context.clone();
        const payload = await response.json();
        message = payload?.error || payload?.message || message;
      } catch {
        try {
          const response = context.clone();
          const text = await response.text();
          if (text?.trim()) message = text.trim();
        } catch {
          // Keep the original functions error message.
        }
      }
    }

    throw new Error(message);
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

export const relativeDate = (value?: string | null) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';

  const diff = date.getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  const hours = Math.round(diff / 3600000);
  const days = Math.round(diff / 86400000);

  if (Math.abs(minutes) < 60) {
    if (minutes === 0) return 'Now';
    return minutes < 0 ? `${Math.abs(minutes)}m overdue` : `in ${minutes}m`;
  }
  if (Math.abs(hours) < 24) {
    return hours < 0 ? `${Math.abs(hours)}h overdue` : `in ${hours}h`;
  }
  if (Math.abs(days) <= 14) {
    return days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`;
  }
  return compactDate(value);
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
