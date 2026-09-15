import type {
  Metadata,
  Viewport,
} from 'next';

export const metadata: Metadata = {
  title: 'ReDream Systems',
  description:
    'The operating system behind modern football agencies.',
  applicationName: 'ReDream Systems',
  manifest: '/platform/manifest.webmanifest',
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: '/platform/icon.svg',
    shortcut: '/platform/icon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'ReDream Systems',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#18131f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
