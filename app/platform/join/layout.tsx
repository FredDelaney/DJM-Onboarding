import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Secure workspace activation',
  description: 'Activate your agency workspace securely.',
  applicationName: 'Agency Workspace',
  manifest: '/platform/join-manifest.webmanifest',
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: '/platform/join-icon.svg',
    apple: '/platform/join-icon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'Agency Workspace',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#111827',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function AgencyJoinLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
