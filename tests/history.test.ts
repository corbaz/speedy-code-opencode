import { describe, expect, test } from "bun:test"

import { POWERSHELL } from "../src/powershell"

import { ClipPlayer, HISTORY_LENGTH, clipParts, listClips, playCommand, readSource, withStarted, type Directory } from "../src/history"
import type { SpeakingProcess } from "../src/speech"

/** A process the test drives by hand. */
function fakeProcess(chunks: readonly string[] = []) {
  const state = { stopped: false }
  const process: SpeakingProcess = {
    stop: () => {
      state.stopped = true
    },
    output: (async function* () {
      for (const chunk of chunks) yield chunk
    })(),
  }
  return { process, state }
}

async function flush() {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("playCommand", () => {
  test("plays through PowerShell on Windows", () => {
    const command = playCommand({
      platform: "win32",
      root: "C:\\plugin",
      python: "python",
      clip: "C:\\audio\\uno.mp3",
      control: "C:\\control\\clip.txt",
    })

    expect(command.argv).toEqual([
      POWERSHELL,
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\plugin\\engine\\play.ps1",
    ])
    expect(command.env).toEqual({ SPEEDY_CLIP: "C:\\audio\\uno.mp3", SPEEDY_CONTROL: "C:\\control\\clip.txt" })
  })

  test("plays through Python elsewhere", () => {
    const command = playCommand({
      platform: "darwin",
      root: "/plugin",
      python: "/venv/bin/python",
      clip: "/audio/uno.mp3",
      control: "/control/clip.txt",
    })

    expect(command.argv).toEqual(["/venv/bin/python", "/plugin/engine/play.py"])
    expect(command.env).toEqual({ SPEEDY_CLIP: "/audio/uno.mp3", SPEEDY_CONTROL: "/control/clip.txt" })
  })
})

describe("listClips", () => {
  const directory: Directory = {
    read: async () => ["viejo.mp3", "nuevo.mp3", "notas.txt"],
    modified: async (path) =>
      path.endsWith("nuevo.mp3") ? 2_000 : path.endsWith("viejo.mp3") ? 1_000 : 0,
    join: (dir, name) => `${dir}/${name}`,
  }

  test("lists the newest first and drops everything that is not a narration", async () => {
    expect(await listClips("/audio", 10, directory)).toEqual([
      { path: "/audio/nuevo.mp3", name: "nuevo" },
      { path: "/audio/viejo.mp3", name: "viejo" },
    ])
  })

  test("keeps only the newest ones the history holds", async () => {
    const clips = await listClips("/audio", 1, directory)
    expect(clips.map((clip) => clip.name)).toEqual(["nuevo"])
    expect(HISTORY_LENGTH).toBe(10)
  })

  test("holds nothing when the folder cannot be read", async () => {
    const missing: Directory = {
      read: async () => {
        throw new Error("ENOENT")
      },
      modified: async () => 0,
      join: (dir, name) => `${dir}/${name}`,
    }
    expect(await listClips("/audio", 10, missing)).toEqual([])
  })
})

describe("clipParts", () => {
  test("splits the description from the stamp", () => {
    expect(clipParts({ path: "/a", name: "Hola-mundo-26-11-15_09-04-07" })).toEqual({
      description: "Hola-mundo",
      stamp: "26-11-15_09-04-07",
    })
  })

  test("keeps a name without a stamp whole", () => {
    expect(clipParts({ path: "/a", name: "notas" })).toEqual({ description: "notas", stamp: "" })
  })
})

describe("ClipPlayer", () => {
  test("reports playing as soon as the clip starts", async () => {
    const fake = fakeProcess(["..\n"])
    const states: string[] = []
    const player = new ClipPlayer({
      play: () => fake.process,
      controlPath: () => "clip.txt",
      writeControl: async () => {},
      onState: (state) => states.push(state),
    })

    await player.play({ path: "/audio/uno.mp3", name: "uno" })

    expect(states).toEqual(["idle", "playing", "idle"])
  })

  test("passes the clip and the control file to the engine", async () => {
    const fake = fakeProcess([])
    const seen: Array<{ clip: string; controlPath: string }> = []
    const player = new ClipPlayer({
      play: (request) => {
        seen.push(request)
        return fake.process
      },
      controlPath: () => "clip.txt",
      writeControl: async () => {},
      onState: () => {},
    })

    await player.play({ path: "/audio/uno.mp3", name: "uno" })

    expect(seen).toEqual([{ clip: "/audio/uno.mp3", controlPath: "clip.txt" }])
  })

  test("pauses and resumes through the control file", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const written: string[] = []
    const player = new ClipPlayer({
      play: () => ({
        stop: () => {},
        output: (async function* () {
          await gate
        })(),
      }),
      controlPath: () => "clip.txt",
      writeControl: async (_path, asked) => {
        written.push(asked)
      },
      onState: () => {},
    })

    const running = player.play({ path: "/audio/uno.mp3", name: "uno" })
    await flush()
    await player.pause()
    await player.resume()
    release()
    await running

    expect(written).toEqual(["play", "pause", "play"])
  })

  test("stops the clip and removes its control file", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const state = { stopped: false }
    const removed: string[] = []
    const player = new ClipPlayer({
      play: () => ({
        stop: () => {
          state.stopped = true
        },
        output: (async function* () {
          await gate
        })(),
      }),
      controlPath: () => "clip.txt",
      writeControl: async () => {},
      removeControl: async (path) => {
        removed.push(path)
      },
      onState: () => {},
    })

    const running = player.play({ path: "/audio/uno.mp3", name: "uno" })
    await flush()
    await player.stop()
    release()
    await running

    expect(state.stopped).toBe(true)
    expect(removed).toEqual(["clip.txt"])
    expect(player.state).toBe("idle")
  })
})

test("readSource: of the selection and the clipboard, the one that changed last is read; a new selection first", () => {
  const none = { selection: "", clipboard: "", source: "" as const }
  expect(readSource("sel", "clip", none)).toBe("selection")
  expect(readSource("", "clip", none)).toBe("clipboard")
  // The selection still there from before, and a text copied since: the clipboard's.
  expect(readSource("sel", "nuevo", { selection: "sel", clipboard: "clip", source: "selection" })).toBe("clipboard")
  // Another text selected since: the selection's, whatever the clipboard.
  expect(readSource("otra", "nuevo", { selection: "sel", clipboard: "clip", source: "clipboard" })).toBe("selection")
  // Nothing changed: what was read last is read again.
  expect(readSource("sel", "clip", { selection: "sel", clipboard: "clip", source: "clipboard" })).toBe("clipboard")
  expect(readSource("sel", "clip", { selection: "sel", clipboard: "clip", source: "selection" })).toBe("selection")
  expect(readSource("", "", none)).toBe("clipboard")
})

test("withStarted: a narration started is on top of the list before its file is written, and waited for no more once it is", () => {
  const started = new Set(["C:\\audio\\Hola-26-11-23_10-00-00.mp3"])
  const kept = [{ path: "C:\\audio\\Viejo-26-11-01_09-00-00.mp3", name: "Viejo-26-11-01_09-00-00" }]
  expect(withStarted(kept, started)).toEqual([{ path: "C:\\audio\\Hola-26-11-23_10-00-00.mp3", name: "Hola-26-11-23_10-00-00" }, ...kept])
  // Found on the disk: listed once, from the disk.
  const found = [{ path: "C:\\audio\\Hola-26-11-23_10-00-00.mp3", name: "Hola-26-11-23_10-00-00" }, ...kept]
  expect(withStarted(found, started)).toEqual(found)
  expect(started.size).toBe(0)
})
