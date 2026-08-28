import './globals.css';
import './admin-polish.css';
import './player-21.css';
import './dossier.css';
import './club-share.css';
import './profile-21.css';
import './ux-smooth.css';
import './player-premium.css';
import './player-nav-contrast-fix.css';
import './(djm-os)/djm-os.css';
import './workspace-nav.css';

export const metadata = {
  title: 'DJM Player',
  description:
    'Private career app by DJM Sports Management',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'DJM Player',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: '#061f3a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
