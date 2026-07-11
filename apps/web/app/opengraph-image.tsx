import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';
import { siteTagline } from '@/lib/site';

export const runtime = 'edge';
export const alt = siteTagline;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The `og:image` for every page (Next injects it from this file convention). */
export default function OpengraphImage() {
  return ogImage();
}
