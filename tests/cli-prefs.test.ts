import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const python = Bun.which("python3") ?? Bun.which("python")
const script = join(import.meta.dir, "..", "setup", "cli_prefs.py")

/** Runs the script on a config file of its own, and says what it printed and how it ended. */
async function prefs(path: string, ...flags: string[]) {
  const child = Bun.spawn([python ?? "python", script, ...flags, path], { stdout: "pipe", stderr: "pipe" })
  const out = (await new Response(child.stdout).text()).trim()
  return { out, code: await child.exited }
}

describe.skipIf(!python)("OpenCode's own preferences", () => {
  test("hides the sidebar, keeps every other key and leaves a copy of the file as it was", async () => {
    const folder = await mkdtemp(join(tmpdir(), "speedy-prefs-"))
    const path = join(folder, "cli.json")
    const before = JSON.stringify({ theme: { name: "x" }, session: { scrollbar: false } })
    await writeFile(path, before)
    try {
      expect(await prefs(path, "--check")).toEqual({ out: "fail a la vista", code: 1 })
      expect(await readFile(path, "utf8")).toBe(before)

      expect(await prefs(path)).toEqual({ out: "session.sidebar: — → hide", code: 0 })
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
        theme: { name: "x" },
        session: { scrollbar: false, sidebar: "hide" },
      })
      expect(await readFile(`${path}.bak`, "utf8")).toBe(before)

      expect(await prefs(path)).toEqual({ out: "ya estaba bien", code: 0 })
      expect(await prefs(path, "--check")).toEqual({ out: "ok oculta", code: 0 })
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test("writes the file when OpenCode has not made it yet", async () => {
    const folder = await mkdtemp(join(tmpdir(), "speedy-prefs-"))
    const path = join(folder, "cli.json")
    try {
      expect((await prefs(path)).code).toBe(0)
      expect(JSON.parse(await readFile(path, "utf8")).session).toEqual({ sidebar: "hide" })
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test("leaves a file it cannot read as it is, and says why", async () => {
    const folder = await mkdtemp(join(tmpdir(), "speedy-prefs-"))
    const path = join(folder, "cli.json")
    await writeFile(path, "{ // a comment\n}")
    try {
      const result = await prefs(path)
      expect(result.code).toBe(1)
      expect(result.out).toStartWith("no pude cambiar")
      expect(await readFile(path, "utf8")).toBe("{ // a comment\n}")
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})
