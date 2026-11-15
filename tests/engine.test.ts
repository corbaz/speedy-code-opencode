import { describe, expect, test } from "bun:test"

import { createSpeaker, type ChildLike } from "../src/engine"
import type { SpeakRequest } from "../src/narration"

const request: SpeakRequest = {
  text: "hola",
  voice: "es-AR-ElenaNeural",
  speed: 1.3,
  controlPath: "C:/tmp/control.txt",
}

/** A child process the test drives by hand. */
function fakeChild(options: { stdout?: readonly string[]; stderr?: readonly string[] } = {}) {
  const listeners = new Map<string, Array<(value?: unknown) => void>>()
  const kills: string[] = []
  const stderrReads: number[] = [0]
  let stdoutOpens = 0

  const child: ChildLike = {
    pid: 4242,
    get stdout() {
      stdoutOpens += 1
      const chunks = options.stdout ?? []
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
    get stderr() {
      stderrReads[0] = (stderrReads[0] ?? 0) + 1
      const chunks = options.stderr ?? []
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
    on(event: string, listener: (value?: unknown) => void) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return child
    },
    kill(signal?: string) {
      kills.push(signal ?? "SIGTERM")
      return true
    },
  }

  const emit = (event: string, value?: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(value)
  }

  return { child, emit, kills, stderrReads, stdoutOpens: () => stdoutOpens }
}

/** Lets every pending microtask and queued iteration run. */
async function flush() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Everything the speaker reports, joined. */
async function collected(process: { output: AsyncIterable<string> }) {
  const chunks: string[] = []
  for await (const chunk of process.output) chunks.push(chunk)
  return chunks.join("")
}

describe("createSpeaker", () => {
  test("runs the engine command the request names", () => {
    const fake = fakeChild()
    const argvSeen: string[][] = []
    const speaker = createSpeaker({
      platform: "darwin",
      root: "/plugin",
      python: "/venv/bin/python",
      spawn: (argv) => {
        argvSeen.push([...argv])
        return fake.child
      },
    })

    const running = speaker(request)
    expect(argvSeen).toEqual([["/venv/bin/python", "/plugin/engine/speak.py"]])
    expect(running).toBeDefined()
  })

  test("streams what the engine prints", async () => {
    const fake = fakeChild({ stdout: ["voice es-AR-ElenaNeural\n", "..\n"] })
    const speaker = createSpeaker({ platform: "darwin", root: "/plugin", python: "/p", spawn: () => fake.child })

    expect(await collected(speaker(request))).toBe("voice es-AR-ElenaNeural\n..\n")
  })

  test("turns a spawn failure into an engine error line instead of throwing", async () => {
    const fake = fakeChild()
    const speaker = createSpeaker({ platform: "darwin", root: "/plugin", python: "/p", spawn: () => fake.child })

    const running = speaker(request)
    fake.emit("error", new Error("spawn python ENOENT"))

    const text = await collected(running)
    expect(text).toContain("error spawn python ENOENT")
  })

  test("ends the output when the engine fails before printing anything", async () => {
    const fake = fakeChild()
    const speaker = createSpeaker({ platform: "win32", root: "C:/plugin", python: "python", spawn: () => fake.child })

    const running = speaker(request)
    fake.emit("error", new Error("powershell not found"))

    const text = await collected(running)
    expect(text.startsWith("error ")).toBe(true)
  })

  test("drains the engine's error output so a full pipe cannot stall it", async () => {
    const fake = fakeChild({ stdout: ["voice x\n"], stderr: ["warning one\n", "warning two\n"] })
    const speaker = createSpeaker({ platform: "darwin", root: "/plugin", python: "/p", spawn: () => fake.child })

    const text = await collected(speaker(request))
    await flush()

    expect(fake.stderrReads[0]).toBeGreaterThan(0)
    expect(text).toBe("voice x\n")
    expect(text).not.toContain("warning")
  })

  test("stops the engine when asked", () => {
    const fake = fakeChild()
    const speaker = createSpeaker({ platform: "darwin", root: "/plugin", python: "/p", spawn: () => fake.child })

    speaker(request).stop()

    expect(fake.kills).toEqual(["SIGTERM"])
  })

  test("stops the whole process tree on Windows", () => {
    const fake = fakeChild()
    const trees: number[] = []
    const speaker = createSpeaker({
      platform: "win32",
      root: "C:/plugin",
      python: "python",
      spawn: () => fake.child,
      killTree: (pid) => trees.push(pid),
    })

    speaker(request).stop()

    expect(trees).toEqual([4242])
    expect(fake.kills).toEqual([])
  })

  test("does not throw when the engine cannot be reached at all", async () => {
    const speaker = createSpeaker({
      platform: "darwin",
      root: "/plugin",
      python: "/p",
      spawn: () => {
        throw new Error("spawn failed synchronously")
      },
    })

    const text = await collected(speaker(request))
    expect(text).toContain("error spawn failed synchronously")
  })
})
