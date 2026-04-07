# Mymir

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)

> Context management for the AI-native engineering era.

Most of us aren't really writing code anymore — we're directing agents that do. But those agents have no memory. Every session starts from zero, and engineers end up spending their time re-explaining what was built, why decisions were made, and what still needs to happen. That's not engineering, that's babysitting.

Mymir replaces that cycle. Instead of re-onboarding your tools every morning, you give them a persistent context network they can actually reason from.

---

## How it works

Mymir introduces two core concepts:

**Context network** — a living map of your project that captures not just what was built, but why decisions were made, what was tried and abandoned, and how different parts of the codebase relate to each other.

**Context retrieval interface** — the layer that lets agents query and use that knowledge at the right moment, so they walk into every session already knowing the story so far.

Together, they turn a forgetful agent into one that understands your project end to end — able to plan new features, spot conflicts with past decisions, and execute without needing a briefing every time.

Mymir walks you through **Brainstorm → Decompose → Refine → Plan → Execute → Track**, powered by AI. Describe your idea and the AI decomposes it into tasks with dependency edges, then generates token-dense context packages your coding agent can consume directly.

*We're building Mymir using Mymir — so everything described here is something we're living in real time.*

---

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

---

## Stack

Next.js 15, TypeScript, React 19, PostgreSQL, Drizzle ORM, Vercel AI SDK, Tailwind CSS v4, Motion

---

## Claude Code Plugin

Mymir ships as a Claude Code plugin that gives Claude persistent project memory.

```text
mcp/
├── .claude-plugin/plugin.json   # Plugin manifest
├── .mcp.json                    # MCP server config (stdio → PostgreSQL)
├── agents/                      # brainstorm, decompose, manage
├── skills/mymir/SKILL.md        # Auto-invocation trigger
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

| Component | What it does |
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

---

## Screenshots

**Structure view** — task list with details panel

![Structure view](assets/projectview.png)

**Graph view** — context network alongside task details

![Graph view](assets/graphview.png)

**Full graph** — the entire context network at a glance

![Full graph](assets/graphonlyview.png)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and PR guidelines.

## License

Mymir is licensed under [AGPL-3.0](LICENSE). A commercial license is also available — see [LICENSING.md](LICENSING.md) for details.
