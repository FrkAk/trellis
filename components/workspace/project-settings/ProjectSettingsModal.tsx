'use client';

import { Modal } from '@/components/shared/Modal';
import { StatusSection } from './StatusSection';
import { TitleSection } from './TitleSection';
import { DescriptionSection } from './DescriptionSection';
import { IdentifierSection } from './IdentifierSection';
import { CategoriesSection } from './CategoriesSection';
import type { ProjectStatus } from '@/lib/types';

interface ProjectSettingsModalProps {
  /** @param open - Whether the modal is visible. */
  open: boolean;
  /** @param onClose - Called when the modal requests dismissal. */
  onClose: () => void;
  /** @param projectId - UUID of the project being edited. */
  projectId: string;
  /** @param project - Current project fields reflected by the form. */
  project: { title: string; description: string; identifier: string; status: ProjectStatus; categories: string[] };
  /** @param taskCount - Number of tasks affected by an identifier rename. */
  taskCount: number;
  /** @param canRename - True when the active org member is allowed to rename project identifiers. */
  canRename: boolean;
  /** @param onUpdated - Fired after a successful update. Caller refetches. */
  onUpdated?: () => void;
}

/**
 * Per-project settings dialog — edit title, description, identifier, categories.
 * Identifier rename uses a 2-click inline-danger confirm with external-ref warning.
 * @param props - Modal configuration.
 * @returns Settings modal rendered via {@link Modal}.
 */
export function ProjectSettingsModal({
  open,
  onClose,
  projectId,
  project,
  taskCount,
  canRename,
  onUpdated,
}: ProjectSettingsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Project settings" maxWidth="md">
      <div className="space-y-5">
        <TitleSection
          projectId={projectId}
          initialTitle={project.title}
          onUpdated={onUpdated}
        />
        <DescriptionSection
          projectId={projectId}
          initialDescription={project.description}
          onUpdated={onUpdated}
        />
        <StatusSection
          projectId={projectId}
          status={project.status}
          onUpdated={onUpdated}
        />
        <IdentifierSection
          projectId={projectId}
          identifier={project.identifier}
          taskCount={taskCount}
          canRename={canRename}
          onUpdated={onUpdated}
        />
        <CategoriesSection
          projectId={projectId}
          categories={project.categories}
          onUpdated={onUpdated}
        />
      </div>
    </Modal>
  );
}

export default ProjectSettingsModal;
