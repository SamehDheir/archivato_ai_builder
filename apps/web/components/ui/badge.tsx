import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * A status pill.
 *
 * Each semantic variant is a `-subtle` surface + its matching
 * `-subtle-foreground` (see globals.css). The old `bg-success/15 text-success`
 * idiom composited a translucent tint onto an unknown surface and then put the
 * SOLID colour on top of it — which failed AA in dark mode, where the solid
 * token is lightened for dark backgrounds and the tint stays near-black.
 * The four-token pairs make each pill's contrast a fixed number.
 *
 * `default` is the success-toned pill (the "Sent to client" badge leans on it),
 * kept as the default for backwards compatibility with existing call sites.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-fast ease-out focus:outline-none',
  {
    variants: {
      variant: {
        default:
          'border-success/40 bg-success-subtle text-success-subtle-foreground',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        primary:
          'border-primary/40 bg-primary-subtle text-primary-subtle-foreground',
        destructive:
          'border-destructive/40 bg-destructive-subtle text-destructive-subtle-foreground',
        warning:
          'border-warning/40 bg-warning-subtle text-warning-subtle-foreground',
        info: 'border-info/40 bg-info-subtle text-info-subtle-foreground',
        // Soft neutral pill (e.g. relation cardinality "M:N") — same surface as
        // secondary but dimmed text, so it reads quieter than a status badge.
        muted: 'border-border bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
