---
name: mymir
description: >
  Persistent context network for coding projects. Tracks tasks, dependencies, decisions, and implementation records across sessions.
  AUTO-INVOKE when the user:
  - Describes a new project or app idea
  - Asks what to work on next, what's left, or what's blocked
  - Reports progress, completion, or decisions on tasks
  - Asks about project structure, dependencies, or architecture
  - Says "continue", "resume", or wants to pick up previous work
  - Mentions decomposition, planning, or breaking down work
  - Wants to dispatch work to multiple agents
  DO NOT invoke for: general coding questions, debugging, file editing, or git operations.
---

# Mymir — Context Network for Coding Projects

Invokable as `/mymir`. You have access to 6 Mymir MCP tools (prefixed `mymir_`) for managing project context across sessions.

## Multi-Team Awareness

Your account spans every team you're a member of. There is no "active" team:

- Read tools (list / search / context / analyze / overview) span every team you belong to.
- Writes either name an explicit `organizationId` or auto-resolve when you're in exactly one team.
- `mymir_project action='list'` returns each project's `organization.id` and `organization.name` — that's how you discover the user's team set when there are projects already.
- `mymir_project action='create'` REQUIRES `organizationId` when the user belongs to more than one team. The server rejects ambiguous creates with the team list inline; ask the user before retrying.
- Cross-team probes (passing an id you don't own) return a 404-shaped error — never trust an id you didn't get from a list/search/context call.

## First Use in Session

1. `mymir_project` with `action='list'` → see existing projects across every team you belong to
2. `mymir_project` with `action='select'` → confirm working project (note the projectId — pass it explicitly on every call)
3. Then use other tools as needed, always passing projectId explicitly

## Data Model

**Project** → **Tasks** (flat list with categories for drawer grouping)

Edges connect tasks: `depends_on` (source needs target done first), `relates_to` (informational link)

Tasks have: title, description, status, category, acceptanceCriteria, decisions, tags, files, implementationPlan, executionRecord

Responses include `taskRef` (e.g. `MYMR-83`) — use when referring to tasks in output; pass UUIDs for tool calls.

`category` determines drawer grouping (one per task, defined at project level).

`tags` MUST cover four dimensions on every task: exactly 1 work type (closed: `bug`/`feature`/`refactor`/`docs`/`test`/`chore`/`perf`), ≥1 cross-cutting concern (open: quality attribute or feature cluster), at most 2 tech tags (most important stack pieces the task touches), exactly 1 priority (closed: `release-blocker`/`core`/`normal`/`backlog`). Do NOT tag codebase area (`category` covers that) or status. Honor user-specified tags as-is.

Task titles: verb+noun format (e.g., "Implement JWT auth", "Fix login redirect").

## Tools

| Tool | Actions/Types | Purpose |
|------|---------------|---------|
| `mymir_project` | list, create, select, update | Manage projects |
| `mymir_task` | create, update, delete, reorder | Manage tasks |
| `mymir_edge` | create, update, remove | Manage dependency edges |
| `mymir_query` | search, list, edges, overview | Find and browse data |
| `mymir_context` | summary, working, agent, planning | Task context at varying depth (see below) |
| `mymir_analyze` | ready, blocked, downstream, critical_path, plannable | Analyze dependency graph |

## Context Depths

| Depth | Use when | What it includes |
|-------|----------|-----------------|
| `summary` | Quick status check | JSON: status, edge counts |
| `working` | Refining, discussing, or reviewing a task | Criteria, decisions, edges (1-hop), siblings |
| `agent` | Writing code for a task | Implementation plan, upstream execution records, files, "Done Means", downstream |
| `planning` | Writing an implementation plan | Project description, acceptance criteria, upstream execution records, downstream specs |

**Don't guess the depth.** When looking up a task, `mymir_query type='search'` returns a `state` field and `_hints` that tell you which depth to use. Follow the hints.

## Response Hints

Tool responses may include a `_hints` array with contextual guidance (missing fields, next steps, warnings). **Always read and follow these hints.**

## Completion Protocol

Before transitioning a task to `status='done'`, confirm based on invoker:

- **Direct user invocation** (no parent agent): ask the user "Ready to mark this done?" with a one-sentence executionRecord preview. Wait for explicit confirmation.
- **Dispatched sub-agent** (parent agent is reviewer): skip the ask. Mark done directly with the full payload. Return to the parent with the task ref and a one-sentence summary.

The update call should populate `executionRecord`, `decisions`, and `files` — tool responses include hints when any are missing. Empty `files` is acceptable only if the task genuinely touched no files (e.g., a decision or research task).

When transitioning to `cancelled`, the same single-vs-dispatched rule applies. Populate `executionRecord` with the cancellation rationale (why abandoned, approaches already tried, optional PR link) and `decisions` with any technical choices made along the way — same expectation as done, just for non-shipping outcomes. Tool responses include `_hints` when these are missing.

If uncertain which mode you're in: default to asking.

## Agent Delegation

Three agents require dedicated delegation — **do not handle these yourself:**

| User intent | Agent | When |
|-------------|-------|------|
| Current repo has existing code but no matching Mymir project | `mymir:onboarding` | Non-empty repo, no project in `mymir_project list` matches it |
| New idea, "I want to build...", app concept | `mymir:brainstorm` | Empty directory, not in a repo, or exploring a concept before code exists |
| "Break this down", "decompose", "create tasks" | `mymir:decompose` | Mymir project exists with description but few/no tasks |

All other project management (status, next task, refine, continue, mark done) is handled directly by this skill. The `mymir:manage` agent exists for explicit delegation only.

### Detection (run on first skill activation of the session)

1. `mymir_project action='list'` → full list
2. Derive current repo identity:
   - Git remote URL: `git config --get remote.origin.url`
   - Package name from `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod`
   - pwd basename as last-resort fallback
3. Match against project titles and descriptions
4. Route:
   - Match found → `mymir_project action='select'` and use workflows below
   - No match AND repo has commits or source files → delegate to `mymir:onboarding`
   - No match AND empty dir / not in a repo → delegate to `mymir:brainstorm`

**If unsure:** check project count. Zero projects → brainstorm (net-new) or onboarding (existing code). Projects exist but none match this repo → onboarding. Project matches but no tasks → decompose. Project matches with tasks → use workflows below.

## Workflows

### "What should I work on?" / "What's next?"
1. `mymir_analyze` `type='ready'` → unblocked tasks
2. If ready tasks exist:
   a. `mymir_analyze` `type='critical_path'` → bottleneck chain
   b. Recommend task at intersection (ready AND on critical path)
   c. `mymir_task` `action='update'` `status='in_progress'` → claim it
   d. `mymir_context` `depth='agent'` → hand off implementation context
3. If NO ready tasks:
   a. `mymir_analyze` `type='plannable'` → draft tasks ready for planning
   b. `mymir_analyze` `type='critical_path'` → prioritize plannable tasks on bottleneck chain
   c. Tell user: "Nothing is ready to code yet — these tasks are ready to be planned."
   d. Follow "Plan a draft task" for the chosen task

### Dispatch to multiple agents
1. `mymir_analyze` `type='ready'` → all unblocked tasks (inherently parallelizable)
2. If ready tasks exist:
   a. Recommend N tasks for N agents, ranked by critical path
   b. Each agent claims: `mymir_task` `action='update'` `status='in_progress'`
   c. Each gets context: `mymir_context` `depth='agent'`
   d. Each sub-agent marks done **directly** with the full payload when complete — they do NOT ask for confirmation. Orchestrator reviews executionRecords after parallel work finishes.
3. If NO ready tasks (or fewer ready than agents):
   a. `mymir_analyze` `type='plannable'` → draft tasks ready for planning
   b. Assign remaining agents to plan draft tasks in parallel
   c. Each: `mymir_context` `depth='planning'` → write plan → `mymir_task` `action='update'` `implementationPlan=...` `status='planned'`

### Implement a task (ALWAYS follow this sequence)
0. If task is `draft`, it MUST be planned first — follow "Plan a draft task" workflow before proceeding.
1. `mymir_task` `action='update'` `status='in_progress'` → claim it first (prevents double-assignment)
2. `mymir_context` `depth='agent'` → multi-hop deps, execution records, acceptance criteria
3. Do the implementation work
4. **Record what you built** — prepare these fields before marking done:
   - `executionRecord`: 3-5 sentences — what was built, approach, concrete details (function names, file paths, endpoints). No debugging stories.
   - `decisions`: one-liner per key technical choice (CHOICE + WHY)
   - `files`: every file created or modified
   - `acceptanceCriteria`: the task's existing criteria array with `checked` updated — set `checked: true` for each criterion clearly satisfied by your work, `false` otherwise
5. **Confirm before marking done** — follow the Completion Protocol (single-agent asks; dispatched skips).
6. `mymir_task` `action='update'` `status='done'` `executionRecord='...'` `decisions=[...]` `files=[...]` `acceptanceCriteria=[...]` — read and follow any `_hints` returned about missing fields.
7. Run **Propagate Changes** on the completed task

**REQUIRED**: Steps 4-7 are NOT optional. Execution records feed downstream tasks via `mymir_context depth='agent'`. Skipping them breaks the context chain.

**Markdown formatting rule (applies to description, executionRecord, implementationPlan, and decisions — NOT files, which are plain path strings):**
Stay concise — same density as before, just use markdown structure so the UI renders it well:
- Use bullet lists (`-`) when listing 3+ items — never as a run-on sentence
- Use backticks for code references: file paths, function names, endpoints, variables
- Use paragraph breaks between distinct topics (executionRecord and decisions should still be short — 3-5 sentences / one-liners)
- Use headings (`##`, `###`) only in longer fields like implementationPlan
- Do NOT pad text to fill space or add filler — brevity is the goal, markdown is just for structure

### Plan a draft task
1. `mymir_context` `depth='planning'` → spec + prerequisites + related work
2. Write the implementation plan:
   - **If plan mode was used**: read the plan file (e.g. `~/.claude/plans/*.md`) and use its full content
   - **Otherwise**: write a detailed plan — file paths, line numbers, specific changes, edge cases, verification steps
3. `mymir_task` `action='update'` `implementationPlan='<full plan content>'` `status='planned'`
   - Save the **complete, unabridged plan in markdown format** — do not summarize

### Mark task done
1. `mymir_query` `type='search'` → find the task
2. If not already `in_progress`, set it first via `mymir_task` `action='update'` `status='in_progress'`
3. Collect execution details:
   - **User described what they did**: extract executionRecord, decisions, files from conversation
   - **User just said "done"**: ask what was built, key decisions, files touched
   - **Coding agent reported back**: summarize the agent's work into executionRecord
4. **Confirm before transitioning** — follow the Completion Protocol.
5. Evaluate acceptance criteria: for each criterion on the task, determine if it was met based on what was built. Set `checked: true` if clearly satisfied, `false` otherwise.
6. `mymir_task` `action='update'` with `status='done'`, `executionRecord`, `decisions`, `files`, `acceptanceCriteria` — **all five required, all in markdown format**
7. Run **Propagate Changes** on the completed task
8. Report what was unlocked: `mymir_analyze type='ready'`

### Continue / Resume
1. `mymir_project` `action='list'` + `action='select'` → note projectId for all subsequent calls
2. `mymir_query` `type='overview'` → big picture
3. `mymir_analyze` `type='ready'` → what's available
4. `mymir_analyze` `type='blocked'` → what's stuck
5. If no ready tasks: `mymir_analyze` `type='plannable'` → what can be planned
6. Summarize: progress, blockers, and concrete next-step recommendations

### Propagate Changes (run after every status change)
1. `mymir_query` `type='edges'` on the changed task → current relationships
2. `mymir_analyze` `type='downstream'` → tasks that depend on this one
3. For each downstream task, check:
   - Do edge notes need updating to reflect new decisions?
   - Are there NEW relationships revealed by this change?
   - Are there STALE relationships that no longer make sense?
   - Do downstream descriptions/criteria need updating?
4. Create/update/remove edges as needed

**For cancellations specifically**: edges to a cancelled task remain in place, and cancellation is transitive-aware (dependents stay blocked through the cancelled task's own unsatisfied deps). The question is mostly *"is there a replacement?"* — if a new task supersedes the cancelled one, rewire dependents to point at the replacement. If the cancelled scope is genuinely abandoned with no successor, dependents may need to be cancelled too (or re-scoped to no longer require it).

### Refine a task
1. `mymir_context` `depth='working'` → understand current state
2. Help improve description, acceptance criteria, decisions, dependencies
3. `mymir_task` `action='update'` → save changes

### Create a project
1. `mymir_project action='list'` → see existing projects with team metadata (`organization.id`, `organization.name`).
2. **If the user is a member of more than one team and didn't say which, ASK BEFORE CREATING.** The server will refuse the create with the team list inline if `organizationId` is missing in a multi-team account — don't try to default.
3. `mymir_project action='create' title='<verb+noun>' description='<3-5 sentences>' organizationId='<team-uuid>'` (omit `organizationId` only when the user is in exactly one team).
4. Then run "Create a task" repeatedly to populate the project, or hand to `mymir:decompose` for a full breakdown.

### Create a task
0. Check `mymir_query type='overview'` Tag vocabulary section for existing tags to reuse.
1. `mymir_task` `action='create'` with title (verb+noun), description, acceptanceCriteria, category, and tags
2. `mymir_edge` `action='create'` for any dependencies or relationships
3. Verify: `mymir_query` `type='edges'` on the new task — confirm edges look correct

### Delete a task
First decide: cancel or delete?
- **Cancel** when: the task represents a *decision* worth keeping (abandoned approach, deprioritized scope, superseded design, PR closed without merge). Preserves rationale, edges, and execution records for downstream context.
- **Delete** when: the task is *noise* (accidental creation, wrong project, duplicate, never had any meaningful content). Permanent removal.

When cancelling: `mymir_task action='update' status='cancelled' executionRecord='<rationale + approaches tried>' decisions=[...]`. The `executionRecord` should capture *why* this was abandoned and *what was tried already* — same shape as a done record, just describing a non-shipping outcome instead of a shipping one. Tool responses include hints when these fields are missing. When deleting:
1. `mymir_task` `action='delete'` → preview mode (shows impact)
2. Show user the impact, wait for confirmation
3. `mymir_task` `action='delete'` `preview=false` → execute

### Update project
→ `mymir_project` `action='update'` with `title`, `description`, or `status` (brainstorming → decomposing → active → archived).

### Project status
→ `mymir_query` `type='overview'`

### Update dependencies
→ `mymir_query` `type='edges'` to review → `mymir_edge` to create/update/remove as needed

### When user mentions a task by name
1. `mymir_query` `type='search'` → find it (response includes `state` and `_hints`)
2. Follow the `_hints` to pick the correct context depth:
   - `plannable` → `depth='planning'`
   - `ready` → `depth='agent'`
   - `blocked` / `done` / `in_progress` / `draft` → `depth='working'`

### Filter tasks by tag
Pass `tags=['<tag>', ...]` to `mymir_query` `type='search'` for an exact, OR-within tag filter — combine with `query` to narrow by name. Pick tags from the Tag vocabulary line in `type='overview'`.

### Review edge quality
1. `mymir_query` `type='list'` → all tasks
2. For tasks with many connections: `mymir_query` `type='edges'` → check each edge has a note and correct type
3. Fix missing notes via `mymir_edge` `action='update'` — notes propagate to downstream agent context
4. Remove stale edges where the relationship no longer holds

### Verify on correction
When the user corrects task info (wrong status, bad description, missing edge):
1. `mymir_query` `type='search'` → find the task
2. `mymir_context` `depth='working'` → see current state
3. Fix via `mymir_task` `action='update'` or `mymir_edge` create/update/remove
4. `mymir_query` `type='edges'` → confirm no stale edges

## Status Values

`draft` → `planned` → `in_progress` → `done` (productive completion)

`cancelled` — parallel terminal state for explicitly abandoned work. Reachable from any non-terminal state. Cancelled tasks are **transparent** in the dependency graph — passable but never themselves satisfying. A dependent only becomes ready when every active task reachable through cancelled middles is `done`. So cancelling a task whose own deps weren't satisfied does NOT silently unblock dependents; they stay blocked through the transitive chain. Cancelled tasks are excluded from progress %, critical path, and blocked listings.

## Edge Types

- `depends_on`: source needs target done first
- `relates_to`: informational link

## Edge Type Decision Criteria

Use `depends_on` when the source task **cannot start or complete** without the target's output:
- Source needs code/APIs/schema built by the target
- Source needs decisions or configuration defined in the target

Use `relates_to` when tasks share context but **neither blocks the other**:
- Tasks touch the same area of code but can be built independently
- One task's decisions are useful context but not required

**When in doubt**: removing the target makes source impossible → `depends_on`. Just harder → `relates_to`.
