'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { GetStartedModal } from '@/components/home/GetStartedModal';
import { IconPlus } from '@/components/shared/icons';

interface NewProjectButtonProps {
  /** Switches the modal between first-time and returning copy. */
  hasProjects: boolean;
}

/**
 * Primary CTA in the home-page header. Opens {@link GetStartedModal} where
 * the install / "talk to your agent" copy lives. Project creation itself
 * happens in the user's coding agent via MCP — the button is a pointer,
 * not a form. Sits in the header per DESIGN.md §5.2 rather than as a grid
 * placeholder so the project cards aren't interrupted by an empty slot.
 *
 * @param props - Button configuration.
 * @returns Secondary-variant button paired with the modal it triggers.
 */
export function NewProjectButton({ hasProjects }: NewProjectButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="md"
        icon={<IconPlus size={12} />}
        onClick={() => setOpen(true)}
      >
        New project
      </Button>
      <GetStartedModal
        open={open}
        onClose={() => setOpen(false)}
        hasProjects={hasProjects}
      />
    </>
  );
}

export default NewProjectButton;
