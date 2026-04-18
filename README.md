![Mymir](assets/mymir-logo.png)
> Context management for the agent-native engineering era.

Most of us aren't really writing code anymore, we're directing agents that do. But those agents have no memory. Every session starts from zero, and engineers end up spending their time re-explaining what was built, why decisions were made, and what still needs to happen. That's not engineering, that's babysitting.

Mymir replaces that cycle. It's not just a context layer your agents read from, it's an end-to-end project management tool that agents operate natively. Mymir creates tasks, refines them, plans implementations, provides the right context at the right stage, and tracks everything that happens. Your agent harness doesn't need a briefing. It walks into every session knowing exactly what to do next and why.

---

## How it works

Instead of docs, wikis, or messy markdown files, Mymir treats project context as a live knowledge base agents can reason from.

We built Mymir around two core concepts:

**Context network** - a living map of your project that captures not just what was built, but why decisions were made, what was tried and abandoned, and how different parts of the codebase relate to each other.

**Context retrieval interface** - the layer that lets agents query and use that knowledge at the right moment, so they walk into every session already knowing the story so far.

Together, they don't just inform your agent, they drive it. Mymir manages the full lifecycle: **Brainstorm > Decompose > Refine > Plan > Execute > Track**.

Describe your idea and Mymir decomposes it into tasks with dependency edges, determines what's ready to plan or implement, and hands your agent the exact context it needs for that stage. When a task is plannable, your agent gets the spec, prerequisites, and related work. When it's ready to implement, your agent gets the full execution context: upstream decisions, file paths, and acceptance criteria.

The agent moves from task to task with the right context at every step, no manual handoff required.

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

Mymir ships as a Claude Code plugin that bundles an MCP server (6 tools), specialized agents (brainstorm, decompose, manage), and a `/mymir` skill that auto-invokes when you talk about projects, tasks, or planning. You don't call tools manually, you just talk.

**Start a new project from scratch.** The brainstorm agent shapes the idea with you, then the decompose agent breaks it into tasks with dependency edges:

```text
I want to build a real-time dashboard for server metrics
```

**Ask what's next.** Mymir finds unblocked tasks on the critical path, determines whether they need planning or implementation, and hands your agent the right context for that stage:

```text
What should I work on next?
```

Your agent gets stage-appropriate context automatically and acts accordingly.

**Record what happened.** When work is done, Mymir captures execution records, decisions, and file changes so downstream tasks get that context automatically:

```text
Done with "Add hide chat toggle to TaskTab", added a collapse toggle to the chat panel using the same pattern as the spec section.
```

**Check status or steer.** The skill auto-invokes when it detects project intent, but you can also call it explicitly:

```text
/mymir what's the status of the project?
/mymir plan the "Migrate to pub/sub" task
/mymir show me what's blocked and why
```

Your agent moves through the full lifecycle with the right context at every step.

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
BETTER_AUTH_SECRET=generate-a-random-secret-at-least-32-chars
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_GENERATIVE_AI_API_KEY=your-key
```

Spin up Postgres and push the schema:

```bash
bun run db:setup
```

Start the dev server and open [localhost:3000](http://localhost:3000):

```bash
bun run dev
```

### Claude Code plugin

Make sure the dev server is running, then install the plugin globally:

```bash
claude plugin marketplace add ./mcp
claude plugin install mymir@mymir-local
```

This is a one-time setup. Mymir will be available in every Claude Code session.

To update the plugin after pulling changes:

```bash
claude plugin update mymir@mymir-local
```

Then restart Claude Code. MCP server changes (`lib/mcp/`) take effect immediately, no update needed.

Once installed, Claude has access to:

| Component | What it does |
| --- | --- |
| **6 MCP tools** | `mymir_project`, `mymir_task`, `mymir_edge`, `mymir_query`, `mymir_context`, `mymir_analyze` |
| **Brainstorm agent** | Explore and shape a project idea through structured conversation |
| **Decompose agent** | Break a project into tasks with dependency edges |
| **Manage agent** | Navigate, refine, track progress, restructure |
| **Mymir skill** | Auto-invokes when conversation matches project planning |

### Gemini CLI

Make sure the dev server is running, then add Mymir to `~/.gemini/settings.json` (user-scope) or `.gemini/settings.json` (project-scope):

```json
{
  "mcpServers": {
    "mymir": {
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

Then start Gemini and run `/mcp auth mymir` to complete the OAuth flow. A browser window will open for sign-in. Tokens are stored automatically for future sessions.

### Codex CLI

Make sure the dev server is running, then run:

```bash
codex mcp add mymir --url http://localhost:3000/api/mcp
```

This automatically detects the OAuth flow and opens a browser for sign-in. After authorization, Mymir is available the next time you open Codex. Tokens are stored automatically for future sessions.

To install the `/mymir` slash command, install the plugin (one-time, same as Claude Code):

```bash
claude plugin marketplace add ./mcp
claude plugin install mymir@mymir-local
```

---

## How is it going

49 of 70 tasks done. We are almost there.

![Progress](assets/progress.png)

---

## What's coming

We're working on a hosted version for those who want the full experience without the setup. Run from anywhere, access your team's projects, collaborate across sessions. Privacy is a core value, which is why it's taking longer than usual to get right.

The hosted version will be a paid service. We can't bear the infrastructure costs on our own, and we'd rather be upfront about that than pretend otherwise. Self-hosted remains free and always will.

---

## Why open source

We believe everyone should have access to tools that help them build better things. Open source is how we make that real.

It also means we ship faster. Community contributions, bug reports, and ideas make Mymir better for everyone. If you care about better infrastructure for agent-driven development, come build with us.

---

## Stack

Next.js 16, TypeScript 6, React 19, PostgreSQL, Drizzle ORM, Vercel AI SDK, Tailwind CSS v4, Motion

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and PR guidelines.

## License

Mymir is licensed under [AGPL-3.0](LICENSE). A commercial license is also available, see [LICENSING.md](LICENSING.md) for details.
