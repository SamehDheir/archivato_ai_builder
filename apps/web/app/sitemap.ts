import type { MetadataRoute } from 'next';
import { publicRoutes, siteUrl } from '@/lib/site';

/** The public surface. Everything else is behind auth and excluded in robots.ts. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route === '/' ? '' : route}`,
    lastModified,
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : 0.5,
  }));
}
