import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { fetchSharedProject } from '@/lib/api';
import { siteName, siteUrl } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/Logo';
import { SharedProjectView } from '@/components/share/SharedProjectView';

/**
 * The public read of a shared design. `cache` dedupes it across `generateMetadata`
 * and the page body, so one page view is one API call.
 */
const getShared = cache(fetchSharedProject);

/**
 * A share link is **unlisted, not published**. The design is someone's business
 * idea; they sent a link to specific people, and having it turn up in a Google
 * search for their company would be a nasty surprise. `noindex` (plus the
 * `/s/` disallow in robots.ts) keeps it out of the index — while the OG tags
 * below still unfurl in Slack/X/LinkedIn, which is where the growth loop
 * actually happens.
 */
const NOINDEX = { index: false, follow: false } as const;

export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const result = await getShared(params.token);
  if (result.status !== 'ok') {
    return { title: `Shared design — ${siteName}`, robots: NOINDEX };
  }

  const { project } = result;
  const title = `${project.title} — a system design by ${siteName}`;
  const endpoints = project.apiDesign.modules.reduce(
    (n, m) => n + m.endpoints.length,
    0,
  );
  const description =
    `${project.systemDesign.architecture.replace(/_/g, ' ')} · ` +
    `${project.systemDesign.services.length} services · ` +
    `${project.databaseDesign.entities.length} tables · ` +
    `${endpoints} endpoints — generated from one sentence.`;

  const url = `${siteUrl}/s/${params.token}`;
  return {
    title,
    description,
    robots: NOINDEX,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function SharedProjectPage({
  params,
}: {
  params: { token: string };
}) {
  const result = await getShared(params.token);

  if (result.status === 'ok') {
    return (
      <main>
        <SharedProjectView project={result.project} />
      </main>
    );
  }

  // "Revoked" and "our API is down" are different truths — never tell a visitor
  // a perfectly good link is dead just because the backend was asleep.
  return result.status === 'missing' ? <ShareNotFound /> : <ShareUnavailable />;
}

/**
 * Terminal states, server-rendered in **English with no i18n**: they must render
 * without waiting for the lazy `share` namespace chunk (and `ShareUnavailable` in
 * particular is what shows when the backend is unreachable, so it can't depend on
 * anything else working).
 */
function ShareShell({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-6 px-4 text-center">
      <Link href="/" aria-label={siteName}>
        <Logo />
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      {cta}
    </main>
  );
}

/** The token was revoked or never existed — a permanent, honest dead end. */
function ShareNotFound() {
  return (
    <ShareShell
      title="This link isn't available"
      body="The share link was revoked by its owner, or it never existed. Ask them for a fresh link."
      cta={
        <Button asChild>
          <Link href="/">See what {siteName} does</Link>
        </Button>
      }
    />
  );
}

/** The link may be perfectly good — we just couldn't reach the API. Invite a retry. */
function ShareUnavailable() {
  return (
    <ShareShell
      title="This design couldn't be loaded"
      body="We couldn't reach the server just now. The link is probably fine — please try again in a moment."
      cta={
        <Button asChild variant="secondary">
          <Link href="/">Go to {siteName}</Link>
        </Button>
      }
    />
  );
}
