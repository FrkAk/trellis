import { describe, expect, test } from "bun:test";
import { withUserContext } from "@/lib/db/rls";

describe("withUserContext userId validation", () => {
  test("rejects empty userId", async () => {
    await expect(withUserContext("", async () => 1)).rejects.toThrow(
      /valid UUID/i,
    );
  });

  test("rejects ASCII whitespace-only userId", async () => {
    await expect(withUserContext("   ", async () => 1)).rejects.toThrow(
      /valid UUID/i,
    );
  });

  test("rejects Unicode whitespace (U+00A0 non-breaking space)", async () => {
    await expect(withUserContext(" ", async () => 1)).rejects.toThrow(
      /valid UUID/i,
    );
  });

  test("rejects Unicode whitespace (U+2003 em space)", async () => {
    await expect(withUserContext(" ", async () => 1)).rejects.toThrow(
      /valid UUID/i,
    );
  });

  test("rejects non-UUID payload (e.g., session token)", async () => {
    await expect(
      withUserContext("not-a-uuid", async () => 1),
    ).rejects.toThrow(/valid UUID/i);
  });

  test("rejects null/undefined userId types", async () => {
    await expect(
      // @ts-expect-error testing runtime guard
      withUserContext(null, async () => 1),
    ).rejects.toThrow(/valid UUID/i);
    await expect(
      // @ts-expect-error testing runtime guard
      withUserContext(undefined, async () => 1),
    ).rejects.toThrow(/valid UUID/i);
  });

  test("accepts a valid UUID and runs the callback", async () => {
    const sentinel = Symbol("ok");
    const result = await withUserContext(
      "00000000-0000-0000-0000-000000000000",
      async () => sentinel,
    );
    expect(result).toBe(sentinel);
  });
});
