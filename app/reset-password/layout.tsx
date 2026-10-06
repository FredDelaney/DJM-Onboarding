import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'New password',
  robots: { index: false, follow: false },
  alternates: { canonical: '/reset-password' },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
