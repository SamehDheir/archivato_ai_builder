import type { MetadataRoute } from 'next';
import { brand, siteDescription, siteName } from '@/lib/site';

/** Web app manifest — installability + the icon Android uses for the home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: 'Archivato',
    description: siteDescription,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: brand.ink,
    theme_color: brand.ink,
    // Only the static asset is referenced: the generated `apple-icon` route is
    // served from a hashed URL, so hard-coding its path here would 404.
    icons: [{ src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' }],
  };
}
