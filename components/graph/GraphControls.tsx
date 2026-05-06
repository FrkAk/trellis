"use client";

/** Props for the GraphControls component. */
interface GraphControlsProps {
  /** @param onZoomIn - Called when the zoom-in button is clicked. */
  onZoomIn: () => void;
  /** @param onZoomOut - Called when the zoom-out button is clicked. */
  onZoomOut: () => void;
  /** @param onReset - Called when the reset-view button is clicked. */
  onReset: () => void;
  /** @param onFitToScreen - Called when the fit-to-screen button is clicked. */
  onFitToScreen: () => void;
  /** @param zoomLevel - Current zoom scale (1 = 100%). Rendered as a small caption when provided. */
  zoomLevel?: number;
  /**
   * @param rightInset - Pixels on the right edge of the canvas that are
   *   obscured by an overlay (e.g. a detail slide-over). The control panel
   *   shifts left by this amount with a matching ease curve so it rides the
   *   overlay edge instead of getting eaten by it.
   */
  rightInset?: number;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Floating overlay with zoom and view controls for the force graph.
 * Stacked column with hairline dividers, matching the workspace graph
 * prototype.
 *
 * @param props - Control callbacks and optional className.
 * @returns Rendered control panel element.
 */
export function GraphControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onFitToScreen,
  zoomLevel,
  rightInset = 0,
  className = "",
}: GraphControlsProps) {
  return (
    <div
      className={`absolute bottom-4 z-10 flex w-7 flex-col overflow-hidden rounded-md border border-border bg-surface shadow-[var(--shadow-float)] ${className}`}
      style={{
        right: 16 + rightInset,
        transition: 'right 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <ControlButton label="Zoom in" onClick={onZoomIn} divider>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </ControlButton>
      <ControlButton label="Zoom out" onClick={onZoomOut} divider>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </ControlButton>
      <ControlButton label="Fit to screen" onClick={onFitToScreen} divider>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 6V3a1 1 0 011-1h3M10 2h3a1 1 0 011 1v3M14 10v3a1 1 0 01-1 1h-3M6 14H3a1 1 0 01-1-1v-3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ControlButton>
      <ControlButton label="Reset simulation" onClick={onReset}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 8a6 6 0 0110.89-3.48M14 2v4h-4M14 8a6 6 0 01-10.89 3.48M2 14v-4h4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ControlButton>
      {zoomLevel !== undefined && (
        <span className="block border-t border-border py-0.5 text-center font-mono text-[8.5px] leading-none tabular-nums text-text-faint select-none">
          {Math.round(zoomLevel * 100)}%
        </span>
      )}
    </div>
  );
}

/**
 * Single icon button in the controls overlay.
 *
 * @param props - Button props including label, click handler, optional divider, and children.
 * @returns Rendered button element.
 */
function ControlButton({
  label,
  onClick,
  divider,
  children,
}: {
  label: string;
  onClick: () => void;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 cursor-pointer items-center justify-center text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary ${
        divider ? "border-b border-border" : ""
      }`}
    >
      {children}
    </button>
  );
}
