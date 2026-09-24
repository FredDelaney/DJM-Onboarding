import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    { path: '/', priority: 1 },
    { path: '/product', priority: 0.9 },
    { path: '/security', priority: 0.75 },
    { path: '/switch', priority: 0.75 },
  ];

  return pages.map(({ path, priority }) => ({
    url: `https://redreamsystems.com${path}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority,
  }));
}
