import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default:
          'border-success/40 bg-success/15 text-success',
        secondary:
          'border-border bg-secondary text-secondary-foreground',
        primary: 'border-primary/40 bg-primary/15 text-primary',
        destructive: 'border-destructive/40 bg-destructive/15 text-destructive',
        warning: 'border-warning/40 bg-warning/15 text-warning',
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
