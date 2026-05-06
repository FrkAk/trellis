'use client';

import { createContext, useContext, type ReactNode } from 'react';

const WorkspaceLabelContext = createContext<string | null>(null);

interface WorkspaceLabelProviderProps {
  /** @param value - Label rendered as the first breadcrumb in TopBar. */
  value: string;
  /** @param children - Subtree that should see the label via {@link useWorkspaceLabel}. */
  children: ReactNode;
}

/**
 * Client-side provider for the workspace label rendered in TopBar's leading
 * breadcrumb. Mounted by the (server) {@link AppShell} so any descendant
 * page that renders TopBar can read the label without explicit prop drilling.
 *
 * @param props - Provider configuration.
 * @returns Context provider element.
 */
export function WorkspaceLabelProvider({ value, children }: WorkspaceLabelProviderProps) {
  return <WorkspaceLabelContext value={value}>{children}</WorkspaceLabelContext>;
}

/**
 * Read the current workspace label, or `null` when rendered outside the shell.
 * @returns Workspace display label or `null`.
 */
export function useWorkspaceLabel(): string | null {
  return useContext(WorkspaceLabelContext);
}
