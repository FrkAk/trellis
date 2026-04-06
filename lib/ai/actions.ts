"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import type { Decision, HistoryEntry } from "@/lib/types";

/**
 * Process a report-back from an external coding agent.
 * Stores the raw report as executionRecord text, extracts decisions,
 * and marks the task as done.
 * @param taskId - UUID of the task.
 * @param reportText - Raw report text from the agent.
 * @returns The updated task.
 */
export async function processReportBack(taskId: string, reportText: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);

  const summary = reportText.slice(0, 200).trim();
  const newDecisions = extractDecisions(reportText);

  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    type: "refined",
    date: new Date().toISOString(),
    label: "Execution report processed",
    description: summary,
    actor: "ai",
  };

  const allDecisions = [
    ...task.decisions,
    ...newDecisions,
  ];

  const [updated] = await db
    .update(tasks)
    .set({
      executionRecord: reportText.trim(),
      status: "done",
      decisions: allDecisions,
      history: [...task.history, entry],
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning();

  return updated;
}

/**
 * Extract decision items from a report by looking for a "decisions" section.
 * @param text - Raw report text.
 * @returns Array of Decision objects.
 */
function extractDecisions(text: string): Decision[] {
  const sections = new Map<string, string>();
  let currentSection = "summary";
  const lines = text.split("\n");

  for (const line of lines) {
    const headerMatch = line.match(/^##?\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].toLowerCase().trim();
    } else {
      const prev = sections.get(currentSection) ?? "";
      sections.set(currentSection, prev + line + "\n");
    }
  }

  const decisionText = sections.get("new decisions") ?? sections.get("decisions") ?? "";
  return decisionText
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0)
    .map((text) => ({
      id: crypto.randomUUID(),
      text,
      date: new Date().toISOString().slice(0, 10),
      source: "execution" as const,
    }));
}
