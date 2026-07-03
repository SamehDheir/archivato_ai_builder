import Link from 'next/link';
import { ArrowRight, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-7 w-7" />
      </span>
      <p className="mt-6 font-mono text-sm uppercase tracking-[0.25em] text-muted-foreground">
        404 — not found
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">
        This page doesn&apos;t exist
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page you&apos;re looking for may have moved, or the link is out of
        date. Let&apos;s get you back on track.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/dashboard">
            Go to dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
