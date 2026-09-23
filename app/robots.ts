import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/activate/',
        '/admin/',
        '/join/',
        '/platform/',
        '/reset-password',
        '/forgot-password',
        '/workspace/',
        '/settings/',
        '/tell',
      ],
    },
    sitemap: 'https://redreamsystems.com/sitemap.xml',
    host: 'https://redreamsystems.com',
  };
}
