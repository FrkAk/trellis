'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  deleteProjectCategory,
  renameProjectCategory,
  updateProjectSettings,
} from '@/lib/actions/project';

interface CategoriesSectionProps {
  projectId: string;
  categories: string[];
  onUpdated?: () => void;
}

const SECTION_LABEL_CLASS =
  'font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted';

/**
 * Minimal inline category editor — chips with hover-remove + add-new input.
 * Delegates persistence to {@link updateProject} and {@link deleteCategory}.
 * @param props - Section props.
 * @returns Categories row.
 */
export function CategoriesSection({ projectId, categories, onUpdated }: CategoriesSectionProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Append the trimmed draft category if non-empty and not a duplicate.
   * @returns Resolves once the server write settles.
   */
  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { setAdding(false); setNewName(''); return; }
    if (categories.includes(name)) {
      setError(`"${name}" already exists`);
      return;
    }
    setError(null);
    const result = await updateProjectSettings(projectId, {
      categories: [...categories, name],
    });
    if (!result.ok) { setError(result.message); return; }
    setAdding(false);
    setNewName('');
    onUpdated?.();
  };

  /**
   * Remove the named category from the project.
   * @param name - Category to remove.
   * @returns Resolves once the server write settles.
   */
  const handleRemove = async (name: string) => {
    setError(null);
    const result = await deleteProjectCategory(projectId, name);
    if (!result.ok) { setError(result.message); return; }
    onUpdated?.();
  };

  /**
   * Rename a category if the trimmed draft is non-empty, distinct, and unique.
   * @param oldName - Existing category being renamed.
   * @returns Resolves once the server write settles.
   */
  const commitRename = async (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === oldName) {
      setRenaming(null);
      return;
    }
    if (categories.includes(trimmed)) {
      setRenaming(null);
      setError(`"${trimmed}" already exists`);
      return;
    }
    setError(null);
    const result = await renameProjectCategory(projectId, oldName, trimmed);
    setRenaming(null);
    if (!result.ok) { setError(result.message); return; }
    onUpdated?.();
  };

  return (
    <section className="space-y-1.5">
      <label className={SECTION_LABEL_CLASS}>Categories</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map((cat) => {
          if (renaming === cat) {
            return (
              <input
                key={cat}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(cat);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={() => commitRename(cat)}
                autoFocus
                className="w-24 rounded-md bg-accent/8 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-light outline-none ring-1 ring-accent/30"
              />
            );
          }
          return (
            <span
              key={cat}
              className="group/cat inline-flex items-center gap-1 rounded-md bg-accent/8 px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent-light"
            >
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => { setRenaming(cat); setRenameValue(cat); }}
                className="cursor-pointer hover:underline"
                title="Rename category"
              >
                {cat}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => handleRemove(cat)}
                className="cursor-pointer rounded-sm opacity-0 transition-opacity group-hover/cat:opacity-100 hover:text-accent"
                title={`Remove category "${cat}"`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                  <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                </svg>
              </motion.button>
            </span>
          );
        })}

        {adding ? (
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
            onBlur={handleAdd}
            autoFocus
            placeholder="Category"
            className="w-28 rounded-md bg-accent/8 px-1.5 py-0.5 font-mono text-[10px] text-accent placeholder:text-accent/30 outline-none ring-1 ring-accent/30"
          />
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => { setAdding(true); setNewName(''); }}
            className="cursor-pointer rounded-md border border-dashed border-border-strong px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-muted transition-colors hover:border-accent/40 hover:text-accent-light"
          >
            + Add category
          </motion.button>
        )}
      </div>
      {error && (
        <p className="font-mono text-[10px] text-danger">{error}</p>
      )}
    </section>
  );
}
