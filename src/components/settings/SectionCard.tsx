"use client";

/** A group of settings on a page. */
export function SectionCard({
  children,
  title,
  ref,
}: {
  children: React.ReactNode;
  /** Sub-heading, used where a page has more than one group. */
  title?: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className="grid gap-4 rounded-2xl border border-border bg-foreground/[0.03] p-5"
    >
      {title && (
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
