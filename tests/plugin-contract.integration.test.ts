import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

test("pins the OpenCode 2.3.0 development contract", async () => {
  const pkg = await Bun.file("package.json").json()
  const tsconfig = await Bun.file("tsconfig.json").json()

  expect(pkg.dependencies["@opencode/plugin"]).toBe("2.3.0")
  expect(pkg.devDependencies["@opencode/theme"]).toBe("2.3.0")
  expect(pkg.devDependencies["@opentui/core"]).toBe("0.8.4")
  expect(pkg.devDependencies["@opentui/solid"]).toBe("0.8.4")
  expect(tsconfig.compilerOptions.strict).toBe(true)
})

test("documents the composer boundary from the public TUI contract", async () => {
  const entrypoint = fileURLToPath(import.meta.resolve("@opencode/plugin/tui"))
  const declarations = await Bun.file(join(dirname(entrypoint), "context.d.ts")).text()
  const ui = declarations.slice(
    declarations.indexOf("export interface UI"),
    declarations.indexOf("export interface Context"),
  )

  expect(declarations).toContain('"session.composer.top"')
  expect(ui).not.toContain("readonly composer")
  expect(ui).not.toContain("draft")
})

test(
  "global discovery finds the plugin package in an isolated OpenCode home",
  async () => {
    expect(Bun.which("opencode")).not.toBeNull()

    const home = await mkdtemp(join(tmpdir(), "speedy-code-discovery-"))
    const parent = join(home, ".config", "opencode", "plugins")
    const plugin = join(parent, "speedy-code")
    const temp = join(home, "tmp")

    try {
      await mkdir(parent, { recursive: true })
      await mkdir(temp)
      await symlink(process.cwd(), plugin, process.platform === "win32" ? "junction" : "dir")

      const child = Bun.spawn(["opencode", "--standalone", "plugin", "list"], {
        cwd: home,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          XDG_CONFIG_HOME: join(home, ".config"),
          TMPDIR: temp,
          TEMP: temp,
          TMP: temp,
          NO_COLOR: "1",
        },
        stdout: "pipe",
        stderr: "pipe",
      })

      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect(exitCode, stderr).toBe(0)
      expect(stdout.replaceAll("\\", "/")).toContain(plugin.replaceAll("\\", "/"))
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  },
  60_000,
)
