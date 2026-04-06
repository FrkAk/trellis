import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ProjectStatus,
  TaskStatus,
  EdgeType,
  Message,
  Decision,
  HistoryEntry,
  AcceptanceCriterion,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").$type<ProjectStatus>().notNull().default("brainstorming"),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  history: jsonb("history").$type<HistoryEntry[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<TaskStatus>().notNull().default("draft"),
    order: integer("order").notNull().default(0),
    category: text("category"),
    acceptanceCriteria: jsonb("acceptance_criteria")
      .$type<AcceptanceCriterion[]>()
      .notNull()
      .default([]),
    decisions: jsonb("decisions").$type<Decision[]>().notNull().default([]),
    implementationPlan: text("implementation_plan"),
    executionRecord: text("execution_record"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    files: jsonb("files").$type<string[]>().notNull().default([]),
    history: jsonb("history").$type<HistoryEntry[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_project_id_idx").on(t.projectId)],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// ---------------------------------------------------------------------------
// Task Edges
// ---------------------------------------------------------------------------

export const taskEdges = pgTable(
  "task_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceTaskId: uuid("source_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    targetTaskId: uuid("target_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    edgeType: text("edge_type").$type<EdgeType>().notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_edges_source_idx").on(t.sourceTaskId),
    index("task_edges_target_idx").on(t.targetTaskId),
    uniqueIndex("task_edges_unique_idx").on(t.sourceTaskId, t.targetTaskId, t.edgeType),
  ],
);

export type TaskEdge = typeof taskEdges.$inferSelect;
export type NewTaskEdge = typeof taskEdges.$inferInsert;

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    messages: jsonb("messages").$type<Message[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_project_id_idx").on(t.projectId),
    index("conversations_task_id_idx").on(t.taskId),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
