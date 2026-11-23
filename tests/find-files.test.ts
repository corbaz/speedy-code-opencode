import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const python = Bun.which("python3") ?? Bun.which("python")
const script = join(import.meta.dir, "..", "engine", "find_files.py")

// The files find_files.py says it found under `root`, as paths from it.
async function find(root: string, pattern: string): Promise<string[]> {
  const child = Bun.spawn([python ?? "python", script], {
    env: { ...process.env, SPEEDY_ROOT: root, SPEEDY_PATTERN: pattern, SPEEDY_FIRST: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(child.stdout).text()
  expect(await child.exited).toBe(0)
  const lines = out.trim().split("\n").map((line) => JSON.parse(line))
  expect(lines.at(-1).done).toBe(true)
  const base = root.replaceAll("\\", "/")
  return lines.flatMap((line) => line.paths as string[]).map((path) => path.slice(base.length + 1)).sort()
}

describe.skipIf(!python)("the search behind the explorer's filter", () => {
  test("finds the files that match, and leaves node_modules and .git unread wherever they are", async () => {
    const root = mkdtempSync(join(tmpdir(), "speedy-find-"))
    try {
      for (const folder of ["docs", "app/node_modules/pkg", "app/.git/objects", "app/src"]) mkdirSync(join(root, folder), { recursive: true })
      for (const file of ["docs/a.pdf", "docs/b.txt", "app/node_modules/pkg/c.pdf", "app/.git/objects/d.pdf", "app/src/e.PDF"]) writeFileSync(join(root, file), "")
      expect(await find(root, "*.pdf")).toEqual(["app/src/e.PDF", "docs/a.pdf"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
