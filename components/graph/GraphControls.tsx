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
  /** @param zoomLevel - Current zoom scale (1 = 100%). */
  zoomLevel?: number;
  /** @param className - Additional CSS classes. */
  className?: string;
}

/**
 * Floating overlay with zoom and view controls for the force graph.
 * @param props - Control callbacks and optional className.
 * @returns Rendered control panel element.
 */
export function GraphControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onFitToScreen,
  zoomLevel,
  className = "",
}: GraphControlsProps) {
  return (
    <div
      className={`absolute bottom-4 right-4 flex flex-col gap-1 rounded-lg bg-surface p-1 border border-border ${className}`}
    >
      <ControlButton label="Zoom in" onClick={onZoomIn}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </ControlButton>
      {zoomLevel !== undefined && (
        <span className="text-center font-mono text-[10px] text-text-muted select-none">
          {Math.round(zoomLevel * 100)}%
        </span>
      )}
      <ControlButton label="Zoom out" onClick={onZoomOut}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </ControlButton>
      <div className="mx-auto my-0.5 h-px w-4 bg-border" />
      <ControlButton label="Fit to screen" onClick={onFitToScreen}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 6V3a1 1 0 011-1h3M10 2h3a1 1 0 011 1v3M14 10v3a1 1 0 01-1 1h-3M6 14H3a1 1 0 01-1-1v-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ControlButton>
      <ControlButton label="Reset simulation" onClick={onReset}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 8a6 6 0 0110.89-3.48M14 2v4h-4M14 8a6 6 0 01-10.89 3.48M2 14v-4h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ControlButton>
    </div>
  );
}

/**
 * Single icon button in the controls overlay.
 * @param props - Button props including label, click handler, and children.
 * @returns Rendered button element.
 */
function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      {children}
    </button>
  );
}
