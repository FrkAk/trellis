/**
 * Custom error types for the graph module.
 */

/**
 * Thrown when the identifier allocation loop exhausts its attempt budget
 * without finding a free suffix for the requested base.
 */
export class IdentifierAllocationError extends Error {
  /**
   * @param base - Starting identifier whose collision could not be resolved.
   */
  constructor(public readonly base: string) {
    super(`Could not allocate unique identifier for base "${base}"`);
    this.name = "IdentifierAllocationError";
  }
}

/**
 * Thrown when a lookup by project UUID returns no row.
 */
export class ProjectNotFoundError extends Error {
  /**
   * @param projectId - UUID that did not match any project.
   */
  constructor(public readonly projectId: string) {
    super(`Project ${projectId} not found`);
    this.name = "ProjectNotFoundError";
  }
}
