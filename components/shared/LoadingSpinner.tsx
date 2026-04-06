'use client';

/**
 * Pulsing dots loading indicator.
 * @param props - Optional label for screen readers and className for positioning.
 * @returns Three animated dots in a centered flex container.
 */
export function LoadingSpinner({
  label = 'Loading',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`} aria-label={label} role="status">
      <span className="loading-dot h-2 w-2 rounded-full bg-accent" />
      <span className="loading-dot h-2 w-2 rounded-full bg-accent" />
      <span className="loading-dot h-2 w-2 rounded-full bg-accent" />
    </div>
  );
}
