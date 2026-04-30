'use client';

import { Modal } from '@/components/shared/Modal';

interface GetStartedModalProps {
  /** @param open - Whether the modal is visible. */
  open: boolean;
  /** @param onClose - Called when the modal requests dismissal. */
  onClose: () => void;
}

interface CliSection {
  name: string;
  install: string;
  note: string;
}

const CLI_SECTIONS: CliSection[] = [
  {
    name: 'Claude Code',
    install: 'claude plugin marketplace add ./plugins/claude-code\nclaude plugin install mymir@mymir-local',
    note: 'Authenticate with /mcp, select mymir, complete browser sign-in. Then talk about your project — the mymir skill auto-invokes.',
  },
  {
    name: 'Codex',
    install: 'codex marketplace add ./plugins',
    note: 'Run /plugin, search for Mymir, install, then restart. Invoke the main skill explicitly with $mymir when needed.',
  },
  {
    name: 'Gemini',
    install: 'gemini extensions install ./plugins/gemini',
    note: 'Authenticate with /mcp auth mymir and complete the browser sign-in.',
  },
  {
    name: 'Cursor',
    install: 'ln -s "$(pwd)/plugins/cursor" ~/.cursor/plugins/local/mymir',
    note: 'Restart Cursor. The MCP server and skills load automatically. First MCP tool call triggers OAuth.',
  },
];

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Get-started dialog — projects are created from a CLI agent, not the web app.
 * Shows install commands per supported CLI, sourced from README.
 * @param props - Modal configuration.
 * @returns Get-started modal rendered via {@link Modal}.
 */
export function GetStartedModal({ open, onClose }: GetStartedModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Get started" maxWidth="lg">
      <div className="max-h-[70vh] space-y-5 overflow-y-auto">
        <p className="text-sm leading-relaxed text-text-secondary">
          Mymir projects are created and updated entirely from your CLI agent. Install
          the plugin for your tool below, then describe your project — the agent
          handles the rest.
        </p>
        {CLI_SECTIONS.map((section) => (
          <section key={section.name} className="space-y-1.5">
            <h3 className={SECTION_LABEL_CLASS}>{section.name}</h3>
            <pre className="overflow-x-auto rounded-md border border-border bg-surface-raised p-3 font-mono text-xs leading-relaxed text-text-primary">
              <code>{section.install}</code>
            </pre>
            <p className="text-xs leading-relaxed text-text-muted">{section.note}</p>
          </section>
        ))}
        <p className="text-xs leading-relaxed text-text-muted">
          Full setup details in the{' '}
          <a
            href="https://github.com/FrkAk/mymir#how-to-set-it-up"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline-offset-2 hover:underline"
          >
            project README
          </a>
          .
        </p>
      </div>
    </Modal>
  );
}

export default GetStartedModal;
