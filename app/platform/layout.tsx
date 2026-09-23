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
    icon: '/brand/redream-app-icon.png',
    shortcut: '/brand/redream-app-icon.png',
    apple: '/brand/redream-app-icon.png',
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
  themeColor: '#0A1B3D',
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
