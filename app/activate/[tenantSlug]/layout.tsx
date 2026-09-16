import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Agency workspace',
  description: 'Private agency owner setup workspace.',
  robots: {
    index: false,
    follow: false,
  },
  appleWebApp: {
    capable: true,
    title: 'Agency workspace',
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

export default function AgencyLaunchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
