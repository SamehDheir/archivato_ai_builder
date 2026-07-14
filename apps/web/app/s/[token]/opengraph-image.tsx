import { fetchSharedProject } from '@/lib/api';
import { ogImage, shareOgImage, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';
import { siteTagline } from '@/lib/site';

export const runtime = 'edge';
export const alt = siteTagline;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The unfurl card for one shared design — the growth loop's first impression.
 * Falls back to the generic site card if the token is revoked or unknown, so a
 * stale link still unfurls as *something* rather than a broken image.
 */
export default async function ShareOpengraphImage({
  params,
}: {
  params: { token: string };
}) {
  const result = await fetchSharedProject(params.token);
  if (result.status !== 'ok') return ogImage();
  const { project } = result;

  return shareOgImage({
    title: project.title,
    architecture: project.systemDesign.architecture,
    services: project.systemDesign.services.length,
    tables: project.databaseDesign.entities.length,
    // Undefined (not 0) on a free-tier share — the API design is a Pro stage.
    endpoints: project.apiDesign?.modules.reduce(
      (n, m) => n + m.endpoints.length,
      0,
    ),
  });
}
