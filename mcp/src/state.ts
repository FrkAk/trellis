let currentProjectId: string | null = null;

/**
 * Get the current project ID.
 * @returns The current project ID.
 * @throws If no project is selected.
 */
export function getProjectId(): string {
  if (!currentProjectId) {
    throw new Error(
      "No project selected. Call mymir_project with action='select' first, or pass projectId explicitly.",
    );
  }
  return currentProjectId;
}

/**
 * Set the current project ID for session-scoped tools.
 * @param id - UUID of the project.
 */
export function setProjectId(id: string): void {
  currentProjectId = id;
}

/**
 * Resolve a project ID: use explicit if provided, otherwise fall back to session state.
 * @param explicit - Optional explicit project ID override.
 * @returns Resolved project ID.
 * @throws If neither explicit nor session project ID is available.
 */
export function resolveProjectId(explicit?: string): string {
  if (explicit) return explicit;
  return getProjectId();
}
