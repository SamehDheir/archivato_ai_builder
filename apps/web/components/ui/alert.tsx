import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * A callout. Every variant is a `-subtle` surface + its matching
 * `-subtle-foreground`, so the text contrast is a fixed, checkable number rather
 * than whatever `bg-x/10` happened to composite to on the surface underneath.
 *
 * The icon is positioned with LOGICAL properties (`start-4`, `ps-7`). It used to
 * use `left-4`/`pl-7`, which pinned it to the physical left and let the text run
 * underneath it in Arabic — one of the RTL bugs R14 swept up.
 */
const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-small [&>svg]:absolute [&>svg]:start-4 [&>svg]:top-4 [&>svg]:size-4 [&>svg~*]:ps-7',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        info: 'border-info/40 bg-info-subtle text-info-subtle-foreground [&>svg]:text-info',
        success:
          'border-success/40 bg-success-subtle text-success-subtle-foreground [&>svg]:text-success',
        warning:
          'border-warning/40 bg-warning-subtle text-warning-subtle-foreground [&>svg]:text-warning',
        destructive:
          'border-destructive/50 bg-destructive-subtle text-destructive-subtle-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
