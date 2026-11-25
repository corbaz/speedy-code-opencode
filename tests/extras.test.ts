import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { SETUP_STEPS } from "../src/menus"

const python = Bun.which("python3") ?? Bun.which("python")
const setup = join(import.meta.dir, "..", "setup")

// What extras.py says of one thing, and the code it ends with.
async function extra(...asked: string[]): Promise<[string, number]> {
  const child = Bun.spawn([python ?? "python", join(setup, "extras.py"), ...asked], { env: { ...process.env, PYTHONIOENCODING: "utf-8" }, stdout: "pipe", stderr: "pipe" })
  const out = await new Response(child.stdout).text()
  return [out.trim(), await child.exited]
}

describe("what the plugin uses beside its own Python", () => {
  test("each step the settings show is one both installers report, by the same name", async () => {
    const windowsInstaller = await Bun.file(join(setup, "install.ps1")).text()
    const macInstaller = await Bun.file(join(setup, "install.sh")).text()
    for (const [name] of SETUP_STEPS) {
      expect([name, new RegExp(`(Step|Extra) '${name}' `).test(windowsInstaller)]).toEqual([name, true])
      expect([name, new RegExp(`^step ${name} `, "m").test(macInstaller)]).toEqual([name, true])
    }
  })

  test("ffmpeg is downloaded by the Windows setup alone; the macOS one only looks for it", async () => {
    expect(await Bun.file(join(setup, "install.ps1")).text()).toContain("@('ffmpeg', '--install')")
    expect(await Bun.file(join(setup, "install.sh")).text()).toContain("ffmpeg_step() { extra ffmpeg; }")
  })

  test.skipIf(!python)("a check says one line, ok or fail, and ends with 0 or 1 to match", async () => {
    const [git, gitCode] = await extra("git")
    expect([/^(ok|fail) \S/.test(git), gitCode]).toEqual([true, git.startsWith("ok ") ? 0 : 1])
    // Outside the plugin's own Python there is no folder of its own to put ffmpeg in: it is looked for, never downloaded.
    const [ffmpeg, ffmpegCode] = await extra("ffmpeg")
    expect([/^(ok|fail) \S/.test(ffmpeg), ffmpegCode]).toEqual([true, ffmpeg.startsWith("ok ") ? 0 : 1])
    expect(await extra("nothing")).toEqual(["fail extras.py ffmpeg | git | bun | remotes | access", 1])
  })
})
