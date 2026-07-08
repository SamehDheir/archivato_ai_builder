'use client';

import { useEffect, useState } from 'react';
import { initialsFromName } from '@archivato/shared';
import { cn } from '@/lib/utils';

/** Deterministic hue (0–359) from a name, so a user's initials avatar keeps a
 * stable, distinct color across the app without storing anything. */
function hueFromName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

/**
 * A user's profile picture. Renders the image when `src` is set (a data URI
 * upload or an OAuth provider URL) and falls back to the user's initials on a
 * stable, name-derived color when there's no picture — or if the image fails to
 * load. `size` is the diameter in pixels. Theme-agnostic (white text on a
 * saturated fill reads in both light and dark).
 */
export function UserAvatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  // A new picture deserves a fresh load attempt — otherwise a once-failed image
  // (e.g. a provider URL that 403'd) would keep showing initials even after the
  // user uploads a valid one on the same mounted avatar.
  useEffect(() => setBroken(false), [src]);
  const showImage = Boolean(src) && !broken;
  const label = name?.trim() || '?';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold leading-none text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        backgroundColor: showImage ? undefined : `hsl(${hueFromName(label)} 60% 45%)`,
      }}
      title={label}
    >
      {showImage ? (
        // Plain <img> (not next/image) so data URIs + arbitrary provider hosts
        // load without an image-domain allowlist. `no-referrer` keeps some
        // providers (e.g. Google) from 403-ing the avatar request.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={label}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <span dir="auto" aria-hidden="true">
          {initialsFromName(label)}
        </span>
      )}
    </span>
  );
}
