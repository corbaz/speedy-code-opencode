import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const python = Bun.which("python3") ?? Bun.which("python")
const script = join(import.meta.dir, "..", "engine", "paste.py")

// What paste.py says of one asking, and the code it exits with.
async function paste(verb: string, source: string, target: string): Promise<[string, number]> {
  const child = Bun.spawn([python ?? "python", script], {
    env: { ...process.env, SPEEDY_VERB: verb, SPEEDY_FILE: source, SPEEDY_TARGET: target },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(child.stdout).text()
  return [out.trim(), await child.exited]
}

describe.skipIf(!python)("the explorer's paste", () => {
  test("copies or moves a file or a folder; writes over nothing, and a folder does not go into itself", async () => {
    const root = mkdtempSync(join(tmpdir(), "speedy-paste-"))
    try {
      mkdirSync(join(root, "a", "sub"), { recursive: true })
      mkdirSync(join(root, "b"))
      writeFileSync(join(root, "a", "año.txt"), "hola")
      // A file copied stays where it was; a second time something is there already, and it is left as it is.
      expect(await paste("copy", join(root, "a", "año.txt"), join(root, "b", "año.txt"))).toEqual(["done", 0])
      expect([readFileSync(join(root, "b", "año.txt"), "utf8"), existsSync(join(root, "a", "año.txt"))]).toEqual(["hola", true])
      writeFileSync(join(root, "a", "año.txt"), "otro")
      expect(await paste("copy", join(root, "a", "año.txt"), join(root, "b", "año.txt"))).toEqual(["exists", 1])
      expect(readFileSync(join(root, "b", "año.txt"), "utf8")).toBe("hola")
      // A folder goes with what it holds, but not into itself.
      expect(await paste("copy", join(root, "a"), join(root, "b", "a"))).toEqual(["done", 0])
      expect(existsSync(join(root, "b", "a", "sub"))).toBe(true)
      expect(await paste("move", join(root, "a"), join(root, "a", "sub", "a"))).toEqual(["inside", 1])
      // Moved, it is no longer where it was.
      expect(await paste("move", join(root, "b", "año.txt"), join(root, "a", "sub", "año.txt"))).toEqual(["done", 0])
      expect([existsSync(join(root, "b", "año.txt")), readFileSync(join(root, "a", "sub", "año.txt"), "utf8")]).toEqual([false, "hola"])
      // Nothing to paste, or another verb: an error.
      expect(await paste("copy", join(root, "nada"), join(root, "b", "nada"))).toEqual(["error", 1])
      expect(await paste("zap", join(root, "a"), join(root, "z"))).toEqual(["error", 1])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
