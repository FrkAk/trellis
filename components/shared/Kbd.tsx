import type { ReactNode } from 'react';

interface KbdProps {
  /** @param children - Key glyph(s) — write "⌘K", "N", "ESC" etc. literally. */
  children: ReactNode;
  /** @param dim - Render at the lighter `text-faint` weight for inline rows. */
  dim?: boolean;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Inline keyboard glyph chip — Geist Mono on a raised surface with a hairline border.
 * @param props - Kbd configuration.
 * @returns A `<kbd>` element styled to match the prototype.
 */
export function Kbd({ children, dim = false, className = '' }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center rounded font-mono ${className}`}
      style={{
        minWidth: 16,
        height: 16,
        padding: '0 4px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--color-border)',
        color: dim ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        fontFeatureSettings: '"tnum" 1',
      }}
    >
      {children}
    </kbd>
  );
}

export default Kbd;
