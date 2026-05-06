interface PlaceholderTabProps {
  /** H1 label rendered at the top of the tab. */
  title: string;
  /** Short paragraph that hints at what will live here. */
  subhead: string;
}

/**
 * Stand-in tab body used by Notifications and Billing until those
 * surfaces have backend support. Reuses the dashed-border empty-state
 * pattern from §6.6 so the UI signals "coming" without faking working
 * controls.
 *
 * @param props - Title and subhead for the placeholder.
 * @returns Section with a header and a centred empty card.
 */
export function PlaceholderTab({ title, subhead }: PlaceholderTabProps) {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-[22px] font-semibold leading-tight text-text-primary">
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">{subhead}</p>
      </header>

      <div className="rounded-[10px] border border-dashed border-border-strong bg-transparent px-6 py-12 text-center">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          Coming soon
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed text-text-muted">
          We&apos;re shipping the rest of the surface in the next phases. This
          tab is reserved so the rail layout stays stable.
        </p>
      </div>
    </section>
  );
}
