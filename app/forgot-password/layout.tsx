import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Account recovery',
  robots: { index: false, follow: false },
  alternates: { canonical: '/forgot-password' },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
