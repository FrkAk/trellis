# Mymir

> Context management for the AI-native engineering era.

Most of us aren't really writing code anymore, we're directing agents that do. But those agents have no memory. Every session starts from zero, and engineers end up spending their time re-explaining what was built, why decisions were made, and what still needs to happen. That's not engineering, that's babysitting.

Mymir replaces that cycle. Instead of re-onboarding your tools every morning, you give them a persistent context network they can actually reason from.

---

## How it works

Mymir introduces two core concepts:

**Context network** - a living map of your project that captures not just what was built, but why decisions were made, what was tried and abandoned, and how different parts of the codebase relate to each other.

**Context retrieval interface** - the layer that lets agents query and use that knowledge at the right moment, so they walk into every session already knowing the story so far.

Together, they turn a forgetful agent into one that understands your project end to end, able to plan new features, spot conflicts with past decisions, and execute without needing a briefing every time.

Mymir walks you through **Brainstorm > Decompose > Refine > Plan > Execute > Track**, powered by AI. Describe your idea and the AI decomposes it into tasks with dependency edges, then generates token-dense context packages your coding agent can consume directly.

*We're building Mymir using Mymir, so everything described here is something we're living in real time.*

---

## How it looks

The web UI has two modes: **Structure** and **Graph**.

Structure mode puts your task list on the left and a detail panel on the right. You refine specs, track progress, and review execution records without switching views.

![Structure view](assets/projectview.png)

Graph mode overlays the context network so you can see how tasks, decisions, and dependencies connect while still working in the detail panel.

![Graph view](assets/graphview.png)

Zoom out and the full graph renders your entire context network. Clusters, bottlenecks, and orphaned work become obvious at a glance.

![Full graph](assets/graphonlyview.png)

---

## How it runs

Mymir works through `/mymir`, a skill that auto-invokes when you talk about projects, tasks, or planning. You don't call tools manually, you just talk.

Pick up where you left off:

```text
What should I work on next?
```

Mymir finds unblocked tasks on the critical path and hands your agent the full context, upstream decisions, execution records, and acceptance criteria included.

Describe what you built and Mymir records it for downstream tasks:

```text
Done with "Add hide chat toggle to TaskTab", added a collapse toggle to the chat panel using the same pattern as the spec section.
```

Or start a new project from scratch. The brainstorm agent shapes the idea with you, then the decompose agent breaks it into tasks with dependency edges:

```text
I want to build a real-time dashboard for server metrics
```

The skill auto-invokes when it detects project intent, but you can also call it explicitly with `/mymir`:

```text
/mymir what's the status of the project?
/mymir plan the "Migrate to pub/sub" task
/mymir show me what's blocked and why
```

This covers the full lifecycle: `brainstorm > decompose > refine > plan > execute > track`.

---

## How to set it up

You need [Bun](https://bun.sh) (v1.0+) and [Docker](https://docs.docker.com/get-docker/) for PostgreSQL.

Clone the repo and install dependencies:

```bash
git clone git@github.com:FrkAk/mymir.git
cd mymir
bun install
cp .env.local.example .env.local
```

Add your credentials to `.env.local`:

```bash
DATABASE_URL=postgresql://mymir:mymir@localhost:5432/mymir
GOOGLE_GENERATIVE_AI_API_KEY=your-key
```

Spin up Postgres and push the schema:

```bash
docker compose up -d
bun run db:setup
```

Start the dev server and open [localhost:3000](http://localhost:3000):

```bash
bun run dev
```

### Claude Code plugin

Mymir also ships as a Claude Code plugin, so Claude gets persistent project memory right inside the terminal.

```text
mcp/
├── .claude-plugin/plugin.json   # Plugin manifest
├── .mcp.json                    # MCP server config (stdio > PostgreSQL)
├── agents/                      # brainstorm, decompose, manage
├── skills/mymir/SKILL.md        # Auto-invocation trigger
└── src/                         # MCP server (6 tools)
```

Install and load the plugin:

```bash
cd mcp && bun install
claude --plugin-dir ./mcp
```

Once loaded, Claude has access to:

| Component | What it does |
| --- | --- |
| **6 MCP tools** | `mymir_project`, `mymir_task`, `mymir_edge`, `mymir_query`, `mymir_context`, `mymir_analyze` |
| **Brainstorm agent** | Explore and shape a project idea through structured conversation |
| **Decompose agent** | Break a project into tasks with dependency edges |
| **Manage agent** | Navigate, refine, track progress, restructure |
| **Mymir skill** | Auto-invokes when conversation matches project planning |

---

## How is it going

49 of 70 tasks done. We are almost there.

![Progress](assets/progress.png)

---

## Stack

Next.js 15, TypeScript, React 19, PostgreSQL, Drizzle ORM, Vercel AI SDK, Tailwind CSS v4, Motion

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and PR guidelines.

## License

Mymir is licensed under [AGPL-3.0](LICENSE). A commercial license is also available, see [LICENSING.md](LICENSING.md) for details.
