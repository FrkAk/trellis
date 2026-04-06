import type { EdgeType } from "@/lib/types";
import type { SimulationLinkDatum } from "d3-force";

// ---------------------------------------------------------------------------
// Graph node / link types
// ---------------------------------------------------------------------------

/** A node in the force-directed graph with d3-force positional fields. */
export interface GraphNode {
  id: string;
  title: string;
  status: string;
  tags: string[];
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;

  // Animation fields (managed per-tick)
  /** Entrance progress 0->1. */
  _enterT: number;
  /** Dim progress 0=normal, 1=fully dimmed. */
  _dimT: number;
  /** Selection glow progress 0->1. */
  _selectGlow: number;
}

/** A link between two graph nodes. */
export interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: EdgeType;
}

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

/** Default node radius (used as fallback). */
export const NODE_RADIUS_DEFAULT = 14;

export const EDGE_COLOR: Record<EdgeType, string> = {
  depends_on: "#818cf8",
  relates_to: "#a78bfa",
};

export const RELATES_DASH: number[] = [4, 6];
export const RELATES_OPACITY = 0.6;

export const ACCENT = "#e09100";

export const ZOOM_FACTOR = 1.2;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;

// ---------------------------------------------------------------------------
// Node sizing by connectivity
// ---------------------------------------------------------------------------

/**
 * Compute node radius based on edge count.
 * @param nodeId - Node ID.
 * @param linkCounts - Map of node ID to edge count.
 * @returns Pixel radius for the node.
 */
export function getNodeSize(nodeId: string, linkCounts: Map<string, number>): number {
  const count = linkCounts.get(nodeId) ?? 0;
  if (count >= 7) return 22;
  if (count >= 4) return 18;
  return 14;
}

/**
 * Build a map of node ID -> edge count from links array.
 * @param links - Array of graph links.
 * @returns Map of node ID to number of connections.
 */
export function buildLinkCounts(links: GraphLink[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of links) {
    const srcId = typeof l.source === "string" ? l.source : l.source.id;
    const tgtId = typeof l.target === "string" ? l.target : l.target.id;
    counts.set(srcId, (counts.get(srcId) ?? 0) + 1);
    counts.set(tgtId, (counts.get(tgtId) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Theme colors
// ---------------------------------------------------------------------------

export interface ThemeColors {
  labelText: string;
  labelDimmed: string;
  hoverGlow: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  taskBorder: string;
  statusDraft: string;
  statusPlanned: string;
  statusInProgress: string;
  statusDone: string;
  surface: string;
}

export const DARK_THEME: ThemeColors = {
  labelText: "#e2e8f0",
  labelDimmed: "rgba(226,232,240,0.2)",
  hoverGlow: "rgba(226,232,240,0.4)",
  tooltipBg: "rgba(15,23,42,0.95)",
  tooltipBorder: "rgba(255,255,255,0.15)",
  tooltipText: "#f1f5f9",
  taskBorder: "#0f172a",
  statusDraft: "#64748b",
  statusPlanned: "#22d3ee",
  statusInProgress: "#f59e0b",
  statusDone: "#10b981",
  surface: "rgba(15,23,42,0.85)",
};

export const LIGHT_THEME: ThemeColors = {
  labelText: "#1e293b",
  labelDimmed: "rgba(30,41,59,0.2)",
  hoverGlow: "rgba(30,41,59,0.2)",
  tooltipBg: "rgba(255,255,255,0.97)",
  tooltipBorder: "rgba(0,0,0,0.15)",
  tooltipText: "#0f172a",
  taskBorder: "#ffffff",
  statusDraft: "#94a3b8",
  statusPlanned: "#0891b2",
  statusInProgress: "#d97706",
  statusDone: "#059669",
  surface: "rgba(255,255,255,0.85)",
};

/**
 * Read canvas theme colors from CSS custom properties at runtime.
 * Falls back to static DARK_THEME/LIGHT_THEME during SSR or if reading fails.
 * @returns ThemeColors matching the current CSS theme.
 */
export function getCanvasTheme(): ThemeColors {
  if (typeof document === "undefined") return DARK_THEME;
  const isLight = document.documentElement.classList.contains("light");
  const base = isLight ? LIGHT_THEME : DARK_THEME;
  try {
    const s = getComputedStyle(document.documentElement);
    const read = (prop: string) => s.getPropertyValue(prop).trim();
    const surface = read("--color-surface");
    const textPrimary = read("--color-text-primary");
    if (!surface || !textPrimary) return base;
    return {
      ...base,
      labelText: textPrimary,
      labelDimmed: isLight ? "rgba(30,41,59,0.2)" : "rgba(226,232,240,0.2)",
      surface: isLight ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.85)",
      tooltipText: textPrimary,
      statusDraft: read("--color-todo") || base.statusDraft,
      statusDone: read("--color-done") || base.statusDone,
    };
  } catch {
    return base;
  }
}

/**
 * Map task status to theme color.
 * @param status - Task status string.
 * @param t - Theme colors.
 * @returns Hex color string for the status.
 */
export function statusColor(status: string, t: ThemeColors): string {
  switch (status) {
    case "done": return t.statusDone;
    case "planned": return t.statusPlanned;
    case "in_progress": return t.statusInProgress;
    default: return t.statusDraft;
  }
}

/**
 * Parse hex color to RGB.
 * @param hex - Hex color string (e.g. "#6366f1").
 * @returns [r, g, b] tuple.
 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Ease-out cubic: decelerating to zero.
 * @param t - Progress value between 0 and 1.
 * @returns Eased value between 0 and 1.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
