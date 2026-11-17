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

describe.skipIf(!python)("the icon font's check", () => {
  const font = join(import.meta.dir, "..", "setup", "nerd_font.py")
  const check = async (folder: string) => {
    const child = Bun.spawn([python ?? "python", font, "--check", folder], { stdout: "pipe", stderr: "pipe" })
    const out = (await new Response(child.stdout).text()).trim()
    return { out, code: await child.exited }
  }

  test("says whether the font is in the folder, and fetches nothing", async () => {
    const folder = await mkdtemp(join(tmpdir(), "speedy-font-"))
    try {
      expect(await check(folder)).toEqual({ out: "fail falta", code: 1 })
      await writeFile(join(folder, "SymbolsNerdFontMono-Regular.ttf"), "font")
      expect(await check(folder)).toEqual({ out: "ok instalada", code: 0 })
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test("adds the icon font after Windows Terminal's fonts, once, and keeps the file as it was", async () => {
    const folder = await mkdtemp(join(tmpdir(), "speedy-font-"))
    const path = join(folder, "settings.json")
    const before = JSON.stringify({
      theme: "dark",
      profiles: { defaults: {}, list: [{ name: "A" }, { name: "B", font: { face: "Consolas", size: 11 } }, { name: "C", font: { face: "JetBrainsMono NF" } }] },
    })
    await writeFile(path, before)
    const run = async () => {
      const child = Bun.spawn([python ?? "python", font, "--windows-terminal", path], { stdout: "pipe", stderr: "pipe" })
      const out = (await new Response(child.stdout).text()).trim()
      return { out, code: await child.exited }
    }
    try {
      expect(await run()).toEqual({ out: "Windows Terminal la usa detrás de su fuente", code: 0 })
      const after = JSON.parse(await readFile(path, "utf8"))
      expect(after.theme).toBe("dark")
      expect(after.profiles.defaults.font.face).toBe("Cascadia Mono, Symbols Nerd Font Mono")
      expect(after.profiles.list[0]).toEqual({ name: "A" })
      expect(after.profiles.list[1].font).toEqual({ face: "Consolas, Symbols Nerd Font Mono", size: 11 })
      expect(after.profiles.list[2].font.face).toBe("JetBrainsMono NF")
      expect(await readFile(`${path}.speedy.bak`, "utf8")).toBe(before)
      expect(await run()).toEqual({ out: "Windows Terminal ya la usa", code: 0 })
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})

describe.skipIf(!python)("the terminal's font", () => {
  const script = join(import.meta.dir, "..", "setup", "terminal_font.py")
  const run = async (...flags: string[]) => {
    const child = Bun.spawn([python ?? "python", script, ...flags], { stdout: "pipe", stderr: "pipe" })
    const out = (await new Response(child.stdout).text()).trim()
    return { out, code: await child.exited }
  }

  test("Windows Terminal takes the face and the size, keeps the rest, and one copy of the file as it first was", async () => {
    const folder = await mkdtemp(join(tmpdir(), "speedy-termfont-"))
    const path = join(folder, "settings.json")
    const before = JSON.stringify({
      theme: "dark",
      profiles: { defaults: { font: { face: "Cascadia Mono, Symbols Nerd Font Mono", weight: "medium" } }, list: [{ name: "A" }, { name: "B", font: { face: "Consolas", size: 11 } }] },
    })
    await writeFile(path, before)
    try {
      expect(await run("--size", "14", "--face", "JetBrainsMono NFM", "--windows-terminal", path)).toEqual({ out: "cambiada", code: 0 })
      const after = JSON.parse(await readFile(path, "utf8"))
      expect(after.theme).toBe("dark")
      expect(after.profiles.defaults.font).toEqual({ face: "JetBrainsMono NFM", weight: "medium", size: 14 })
      expect(after.profiles.list).toEqual([{ name: "A" }, { name: "B", font: { face: "JetBrainsMono NFM", size: 14 } }])
      expect(await run("--size", "14", "--face", "JetBrainsMono NFM", "--windows-terminal", path)).toEqual({ out: "ya estaba", code: 0 })
      expect((await run("--size", "12", "--face", "JetBrainsMono NFM", "--windows-terminal", path)).out).toBe("cambiada")
      expect(JSON.parse(await readFile(path, "utf8")).profiles.defaults.font.size).toBe(12)
      expect(await readFile(`${path}.speedy-font.bak`, "utf8")).toBe(before)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test("the check says which family is not whole in the folder, and fetches nothing", async () => {
    const folder = await mkdtemp(join(tmpdir(), "speedy-termfont-"))
    try {
      expect(await run("--check", "--folder", folder)).toEqual({ out: "fail falta JetBrains Mono y Meslo", code: 1 })
      for (const style of ["Regular", "Bold", "Italic", "BoldItalic"]) await writeFile(join(folder, `JetBrainsMonoNerdFont-${style}.ttf`), "font")
      expect(await run("--check", "--folder", folder)).toEqual({ out: "fail falta Meslo", code: 1 })
      for (const style of ["Regular", "Bold", "Italic", "BoldItalic"]) await writeFile(join(folder, `MesloLGSNerdFont-${style}.ttf`), "font")
      expect(await run("--check", "--folder", folder)).toEqual({ out: "ok instaladas", code: 0 })
      expect(await run("--size", "12", "--family", "arial")).toEqual({ out: "la fuente es una de: jetbrains, meslo", code: 1 })
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test("Ghostty and kitty get their two lines in place of the ones they had, and nothing else moves", async () => {
    const folder = await mkdtemp(join(tmpdir(), "speedy-termfont-"))
    const ghostty = join(folder, "config")
    const kitty = join(folder, "kitty.conf")
    await writeFile(ghostty, "theme = dark\nfont-family = Menlo\nfont-size = 11\n# font-size = 9\nfont-feature = -calt\n")
    try {
      expect((await run("--size", "14", "--face", "JetBrainsMono Nerd Font Mono", "--ghostty", ghostty)).out).toBe("cambiada")
      expect(await readFile(ghostty, "utf8")).toBe(
        'theme = dark\n# font-size = 9\nfont-feature = -calt\nfont-family = "JetBrainsMono Nerd Font Mono"\nfont-size = 14\n',
      )
      expect(await readFile(`${ghostty}.speedy-font.bak`, "utf8")).toContain("font-family = Menlo")
      expect((await run("--size", "12", "--face", "JetBrainsMono Nerd Font Mono", "--kitty", kitty)).out).toBe("cambiada")
      expect(await readFile(kitty, "utf8")).toBe("font_family JetBrainsMono Nerd Font Mono\nfont_size 12.0\n")
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  test("a size out of range changes nothing and says the range", async () => {
    expect(await run("--size", "99", "--face", "X", "--ghostty", join(tmpdir(), "speedy-never-written"))).toEqual({
      out: "el tamaño va de 6 a 40 puntos",
      code: 1,
    })
  })
})
