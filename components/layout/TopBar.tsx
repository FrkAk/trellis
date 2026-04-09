'use client';

import Link from 'next/link';
import { useTheme } from '@/components/layout/ThemeProvider';

interface TopBarProps {
  /** @param projectName - Optional breadcrumb project name. */
  projectName?: string;
  /** @param stageLabel - Optional center stage label (e.g. "Brainstorm", "Decompose"). */
  stageLabel?: string;
  /** @param taskStats - Optional center task completion stats. */
  taskStats?: string;
}

/**
 * Fixed top navigation bar with logo, breadcrumb, theme toggle, and settings link.
 * @param props - TopBar configuration.
 * @returns A fixed-position navigation bar element.
 */
export function TopBar({ projectName, stageLabel, taskStats }: TopBarProps) {
  const { theme, setTheme } = useTheme();

  /** Toggle between light and dark theme and persist the choice. */
  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center bg-base/80 backdrop-blur-md pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className="flex w-full items-center justify-between px-4 sm:px-6">
        {/* Left: Logo + breadcrumb */}
        <div className="flex items-center gap-3">
          <Link href="/" className="text-text-primary text-lg font-semibold tracking-tight no-underline">
            Mymir
          </Link>
          {projectName && (
            <>
              <span className="hidden sm:inline text-text-muted">/</span>
              <span className="hidden sm:inline truncate max-w-[200px] text-sm text-text-secondary">{projectName}</span>
            </>
          )}
        </div>

        {/* Center: Phase info */}
        {(stageLabel || taskStats) && (
          <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-3 font-mono text-xs text-text-muted">
            {stageLabel && <span>{stageLabel}</span>}
            {taskStats && <span>{taskStats}</span>}
          </div>
        )}

        {/* Right: Theme toggle + Settings */}
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            onClick={toggleTheme}
            className="cursor-pointer rounded-md p-2.5 sm:p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
          <Link href="/settings" className="rounded-md p-2.5 sm:p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-secondary">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </Link>
        </div>
      </div>
      {/* Bottom gradient line */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-accent/20 via-accent/5 to-transparent" />
    </header>
  );
}

export default TopBar;
