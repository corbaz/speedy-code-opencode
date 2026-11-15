import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const python = Bun.which("python") ?? Bun.which("python3")
const temporary: string[] = []

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function runPython(
  arguments_: string[],
  options: { cwd?: string; env?: Record<string, string>; stdin?: string } = {},
) {
  if (!python) throw new Error("Python 3 is required to test the engine")
  const child = Bun.spawn([python, ...arguments_], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

describe("portable narration engine", () => {
  test("contains the complete cross-platform process layer", async () => {
    const expected = [
      "history.py",
      "listen.py",
      "play.ps1",
      "play.py",
      "player.py",
      "polish.py",
      "speak.ps1",
      "speak.py",
      "tts.py",
    ]

    for (const file of expected) {
      expect(await Bun.file(join("engine", file)).exists(), file).toBe(true)
    }
  })

  test("keeps speech rate and sentence chunking behavior", async () => {
    const result = await runPython(
      [
        "-c",
        "import json; from speak import rate_of, parts_of; print(json.dumps([rate_of('1.3'), rate_of('0.5'), parts_of('One. Two. Three.')]))",
      ],
      { cwd: "engine" },
    )

    expect(result.exitCode, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(["+30%", "-50%", ["One.", "Two.", "Three."]])
  })

  test("joins narration history atomically without overwriting names", async () => {
    const root = await mkdtemp(join(tmpdir(), "speedy-code-engine-"))
    temporary.push(root)
    const first = join(root, "first.mp3")
    const second = join(root, "second.mp3")
    const destination = join(root, "narration.mp3")
    await writeFile(first, "one")
    await writeFile(second, "two")

    for (let count = 0; count < 2; count++) {
      const result = await runPython(["engine/history.py", destination, first, second], {
        env: { SPEEDY_NARRATION: "Narrated text" },
      })
      expect(result.exitCode, result.stderr).toBe(0)
    }

    expect(await readFile(destination, "utf8")).toBe("onetwo")
    expect(await readFile(join(root, "narration.txt"), "utf8")).toBe("Narrated text")
    expect(await readFile(join(root, "narration-2.mp3"), "utf8")).toBe("onetwo")
  })

  test("reports a missing Groq key without making a request", async () => {
    const result = await runPython(["engine/polish.py"], {
      env: { GROQ_API_KEY: "" },
      stdin: JSON.stringify({ model: "test", system: "test", text: "test" }),
    })

    expect(result.exitCode, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      error: "falta la variable de sistema GROQ_API_KEY",
    })
  })
})
