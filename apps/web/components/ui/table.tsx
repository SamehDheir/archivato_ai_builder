'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * ── Column labels, captured from <TableHeader> ────────────────────────────────
 *
 * When a table stacks on a phone (see the `data-stack` CSS in globals.css), each
 * cell loses the column header sitting above it — "must" alone is meaningless
 * without "Priority". So every `<td>` carries a `data-label`, which CSS renders
 * beside it.
 *
 * That label is derived here rather than hand-written at each call site. The
 * alternative was `<TableCell data-label={t('requirements.col.priority')}>` on
 * ~100 cells across a dozen artifact views: the same string typed twice, in two
 * places, guaranteed to drift the first time a header is renamed. Instead the
 * header row writes its text into a ref, and the body rows read it back by cell
 * index — one source of truth, and a renamed header renames its labels for free.
 *
 * Ordering is what makes this safe: React renders children in order, so
 * `<TableHeader>` has always populated the ref before `<TableBody>`'s rows read
 * it. A ref (not state) because this is a render-time lookup, not a state change
 * — setting state during render would loop.
 */
const ColumnLabels = React.createContext<React.MutableRefObject<string[]> | null>(
  null,
);

/** True while rendering inside <TableHeader>, so TableRow knows which job it has. */
const InHeader = React.createContext(false);

/** Flatten a header cell's children to plain text for use as a label. */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) {
    return textOf((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/**
 * A data table that adapts instead of crushing itself.
 *
 * Two problems, two mechanisms:
 *
 * 1. **It used to compress, not scroll.** The wrapper always had `overflow-auto`,
 *    but the table was `w-full` with no floor — so on a phone three columns
 *    squeezed to ~40px each and every cell wrapped one word per line. From `sm`
 *    up, `sm:min-w-[34rem]` gives it an intrinsic minimum, so a narrow viewport
 *    scrolls it *inside this container* while the page body stays put.
 *
 * 2. **Below `sm` it stacks.** Horizontal scrolling a 3-column requirements table
 *    on a 360px phone is technically readable and practically horrible — you swipe
 *    to read a priority, swipe back to see which requirement it belonged to. So
 *    below `sm` each row becomes a labelled block (globals.css `[data-stack]`),
 *    and the min-width deliberately does not apply there.
 *
 * `role` is set explicitly on every part. That is not redundant decoration: the
 * stacking CSS sets `display: block`, which **destroys a table's implicit ARIA
 * semantics** — without these, a screen reader stops announcing rows and columns
 * on exactly the viewport where the visual grid is gone too. With them, the
 * table still reads as a table at every width.
 *
 * A genuinely narrow table opts out of the min-width with `className="min-w-0"`;
 * one that must stay a grid on mobile passes `stack={false}`.
 *
 * NOTE: for the scroll to work the ANCESTOR must be able to shrink — a flex child
 * needs `min-w-0`, or it adopts the table's min-width and pushes the whole page
 * into a horizontal scroll. See the content wrapper in ProjectStages.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { stack?: boolean }
>(({ className, stack = true, ...props }, ref) => {
  const labels = React.useRef<string[]>([]);
  return (
    <ColumnLabels.Provider value={labels}>
      <div className="scrollbar-thin relative w-full overflow-x-auto">
        <table
          ref={ref}
          role="table"
          data-stack={stack ? 'true' : undefined}
          className={cn(
            'w-full caption-bottom text-small sm:min-w-[34rem]',
            className,
          )}
          {...props}
        />
      </div>
    </ColumnLabels.Provider>
  );
});
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <InHeader.Provider value>
    <thead
      ref={ref}
      role="rowgroup"
      className={cn('[&_tr]:border-b', className)}
      {...props}
    />
  </InHeader.Provider>
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    role="rowgroup"
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

/**
 * A row. In the header it harvests the column labels; in the body it stamps each
 * cell with the label for its column (see `ColumnLabels`).
 */
const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, children, ...props }, ref) => {
  const labels = React.useContext(ColumnLabels);
  const inHeader = React.useContext(InHeader);

  let content = children;
  if (labels) {
    if (inHeader) {
      React.Children.forEach(children, (child, i) => {
        if (React.isValidElement(child)) {
          labels.current[i] = textOf(
            (child.props as { children?: React.ReactNode }).children,
          );
        }
      });
    } else {
      content = React.Children.map(children, (child, i) =>
        React.isValidElement<{ 'data-label'?: string }>(child)
          ? // An explicit data-label on the cell wins — a cell can name itself
            // when its header is an icon or a deliberate blank (e.g. an actions
            // column), where harvested text would be an empty string.
            React.cloneElement(child, {
              'data-label': child.props['data-label'] ?? labels.current[i] ?? '',
            })
          : child,
      );
    }
  }

  return (
    <tr
      ref={ref}
      role="row"
      className={cn(
        'border-b border-border transition-colors duration-fast ease-out hover:bg-muted/40 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    >
      {content}
    </tr>
  );
});
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    role="columnheader"
    className={cn(
      // `text-start`, not `text-left`: a physical alignment left every table
      // header hugging the wrong edge in Arabic while its cells aligned right.
      'h-9 px-3 text-start align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} role="cell" className={cn('px-3 py-2.5 align-top', className)} {...props} />
));
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
