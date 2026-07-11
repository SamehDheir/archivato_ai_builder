import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';
import { siteTagline } from '@/lib/site';

export const runtime = 'edge';
export const alt = siteTagline;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Same card as `opengraph-image`, declared separately so `twitter:image` is
 * emitted explicitly rather than relying on Twitter's OG fallback — the card is
 * `summary_large_image`, which renders blank without it.
 */
export default function TwitterImage() {
  return ogImage();
}
