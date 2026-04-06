# Mymir

A persistent context network for coding agents. Mymir walks you through **Brainstorm → Decompose → Refine → Plan → Execute → Track** — powered by AI.

Describe your idea, and the AI decomposes it into tasks with dependency edges, then generates token-dense context packages your coding agent can consume directly.

## Quick Start

Requires [Bun](https://bun.sh) (v1.0+) and [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL).

```bash
git clone git@github.com:FrkAk/mymir.git
cd mymir
bun install
cp .env.local.example .env.local
```

Fill in `.env.local`:

```bash
DATABASE_URL=postgresql://mymir:mymir@localhost:5432/mymir
GOOGLE_GENERATIVE_AI_API_KEY=your-key
```

Start Postgres and push the schema:

```bash
docker compose up -d
bun run db:setup
```

Start the dev server:

```bash
bun run dev
```

Open [localhost:3000](http://localhost:3000)

## Stack

Next.js 15, TypeScript, React 19, PostgreSQL, Drizzle ORM, Vercel AI SDK, Tailwind CSS v4, Motion

## Claude Code Plugin

Mymir ships as a Claude Code plugin that gives Claude persistent project memory.

```text
mcp/
├── .claude-plugin/plugin.json   # Plugin manifest
├── .mcp.json                    # MCP server config (stdio → PostgreSQL)
├── agents/                      # brainstorm, decompose, manage
├── skills/mymir/SKILL.md      # Auto-invocation trigger
└── src/                         # MCP server (6 tools)
```

### Install

```bash
cd mcp && bun install
```

### Use with Claude Code

```bash
claude --plugin-dir ./mcp
```

This gives you:

| Component | What |
| --- | --- |
| **6 MCP tools** | `mymir_project`, `mymir_task`, `mymir_edge`, `mymir_query`, `mymir_context`, `mymir_analyze` |
| **Brainstorm agent** | Explore and shape a project idea through structured conversation |
| **Decompose agent** | Break a project into tasks with dependency edges |
| **Manage agent** | Navigate, refine, track progress, restructure |
| **Mymir skill** | Auto-invokes when conversation matches project planning |

### Quick test

```text
What projects do I have in Mymir?
```

Or start fresh:

```text
I want to build a habit tracking app
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and PR guidelines.

## License

Mymir is licensed under [AGPL-3.0](LICENSE). A commercial license is also available — see [LICENSING.md](LICENSING.md) for details.
