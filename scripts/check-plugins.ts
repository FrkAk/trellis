import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";

interface SharedGroup {
  name: string;
  canonical: string;
  copies: string[];
}

interface VersionTarget {
  path: string;
  jsonPath: string[];
}

interface VersionSync {
  canonical: string;
  copies: VersionTarget[];
}

const shared: SharedGroup[] = [
  {
    name: "skills/mymir/SKILL.md",
    canonical: "plugins/claude-code/skills/mymir/SKILL.md",
    copies: [
      "plugins/codex/skills/mymir/SKILL.md",
      "plugins/gemini/skills/mymir/SKILL.md",
    ],
  },
  {
    name: "brainstorm (agent + skill)",
    canonical: "plugins/claude-code/agents/brainstorm.md",
    copies: [
      "plugins/codex/skills/brainstorm/SKILL.md",
      "plugins/gemini/agents/brainstorm.md",
    ],
  },
  {
    name: "decompose (agent + skill)",
    canonical: "plugins/claude-code/agents/decompose.md",
    copies: [
      "plugins/codex/skills/decompose/SKILL.md",
      "plugins/gemini/agents/decompose.md",
    ],
  },
  {
    name: "manage agent",
    canonical: "plugins/claude-code/agents/manage.md",
    copies: ["plugins/gemini/agents/manage.md"],
  },
  {
    name: "mcp.json",
    canonical: "plugins/claude-code/.mcp.json",
    copies: ["plugins/codex/.mcp.json"],
  },
];

const versionSync: VersionSync = {
  canonical: "plugins/claude-code/.claude-plugin/plugin.json",
  copies: [
    { path: "plugins/codex/.codex-plugin/plugin.json", jsonPath: ["version"] },
    { path: "plugins/gemini/gemini-extension.json", jsonPath: ["version"] },
  ],
};

/**
 * Computes the SHA-256 hex digest of a file's bytes.
 * @param path - Path to read.
 * @returns Lowercase hex hash string.
 */
function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Reads a nested JSON field by key path.
 * @param obj - Root object.
 * @param keys - Ordered list of property names to descend.
 * @returns The leaf value, or undefined if any segment is missing.
 */
function getNested(obj: Record<string, unknown>, keys: string[]): unknown {
  return keys.reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], obj);
}

/**
 * Writes a nested JSON field by key path, mutating the parent object.
 * @param obj - Root object.
 * @param keys - Ordered list of property names; last is the field to set.
 * @param value - Value to assign.
 */
function setNested(obj: Record<string, unknown>, keys: string[], value: unknown): void {
  const last = keys[keys.length - 1];
  const parent = keys.slice(0, -1).reduce<Record<string, unknown>>(
    (acc, k) => acc[k] as Record<string, unknown>,
    obj,
  );
  parent[last] = value;
}

const fix = process.argv.includes("--fix");

let failures = 0;
let changes = 0;

for (const group of shared) {
  if (!existsSync(group.canonical)) {
    console.error(`[missing canonical] ${group.name}: ${group.canonical}`);
    failures++;
    continue;
  }
  const canonicalHash = hashFile(group.canonical);

  for (const copy of group.copies) {
    if (!existsSync(copy)) {
      if (fix) {
        mkdirSync(dirname(copy), { recursive: true });
        copyFileSync(group.canonical, copy);
        console.log(`[created] ${copy}`);
        changes++;
      } else {
        console.error(`[missing] ${copy}`);
        failures++;
      }
      continue;
    }
    const copyHash = hashFile(copy);
    if (copyHash !== canonicalHash) {
      if (fix) {
        copyFileSync(group.canonical, copy);
        console.log(`[synced]  ${copy}`);
        changes++;
      } else {
        console.error(`[drift]   ${group.name}`);
        console.error(`    ${canonicalHash.slice(0, 8)}  ${group.canonical}`);
        console.error(`    ${copyHash.slice(0, 8)}  ${copy}`);
        failures++;
      }
    } else {
      console.log(`[ok]      ${copy}`);
    }
  }
}

const canonicalManifest = JSON.parse(readFileSync(versionSync.canonical, "utf8")) as Record<string, unknown>;
const canonicalVersion = canonicalManifest.version;

if (typeof canonicalVersion !== "string" || canonicalVersion.length === 0) {
  console.error(`[no version] ${versionSync.canonical} is missing a string version field`);
  failures++;
} else {
  for (const target of versionSync.copies) {
    const manifest = JSON.parse(readFileSync(target.path, "utf8")) as Record<string, unknown>;
    const currentVersion = getNested(manifest, target.jsonPath);
    if (currentVersion === canonicalVersion) {
      console.log(`[ok]      ${target.path} version ${canonicalVersion}`);
      continue;
    }
    if (fix) {
      setNested(manifest, target.jsonPath, canonicalVersion);
      writeFileSync(target.path, JSON.stringify(manifest, null, 2) + "\n");
      console.log(`[synced]  ${target.path} version → ${canonicalVersion}`);
      changes++;
    } else {
      console.error(`[version drift] ${target.path}: ${String(currentVersion)} vs ${canonicalVersion}`);
      failures++;
    }
  }
}

if (fix) {
  console.log(changes > 0 ? `\nSynced ${changes} file(s)/field(s).` : `\nNothing to sync.`);
  process.exit(0);
}

if (failures > 0) {
  console.error(`\n${failures} drift issue(s). Run \`bun run sync:plugins\` to auto-fix.`);
  process.exit(1);
}

console.log(`\nAll shared content and versions are in sync.`);
