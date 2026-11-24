import { describe, expect, test } from "bun:test"

import { POWERSHELL } from "../src/powershell"

import {
  MAX_TEXT,
  Narration,
  historyName,
  historySplit,
  plain,
  speakCommand,
  stampOf,
  SPEED,
  type SpeakRequest,
  type SpeakingProcess,
} from "../src/narration"

describe("plain", () => {
  test("removes fenced and inline code", () => {
    expect(plain("Usá `bun test`\n```ts\nconst a = 1\n```\nlisto")).toBe("Usá bun test\n \nlisto")
  })

  test("keeps a link label and drops the target", () => {
    expect(plain("mirá [la guía](https://example.com/x) ahora")).toBe("mirá la guía ahora")
  })

  test("drops a bare url", () => {
    expect(plain("ver https://example.com/x ya")).toBe("ver ya")
  })

  test("strips heading and list markers", () => {
    expect(plain("# Título\n- uno\n- dos\n1. tres")).toBe("Título\nuno\ndos\ntres")
  })

  test("strips emphasis markers", () => {
    expect(plain("**fuerte** y _suave_")).toBe("fuerte y suave")
  })

  test("turns table pipes into commas", () => {
    expect(plain("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe(", a , b , \n\n, 1 , 2 ,")
  })

  test("returns empty text for empty input", () => {
    expect(plain("   \n\n")).toBe("")
  })
})

describe("stampOf", () => {
  test("formats the local time as yy-mm-dd_hh-mm-ss", () => {
    expect(stampOf(new Date(2026, 10, 15, 9, 4, 7))).toBe("26-11-15_09-04-07")
  })
})

describe("historyName", () => {
  test("slugs the start of the text and stamps it", () => {
    expect(historyName("Hola mundo, ¿cómo va?", new Date(2026, 10, 15, 9, 4, 7))).toBe(
      "Hola-mundo,-¿cómo-va-26-11-15_09-04-07.mp3",
    )
  })

  test("removes characters a file name cannot carry", () => {
    expect(historyName('a<b>c:d/e\\f|g?h*i', new Date(2026, 10, 15, 9, 4, 7))).toBe(
      "a-b-c-d-e-f-g-h-i-26-11-15_09-04-07.mp3",
    )
  })

  test("falls back to audio when nothing is left", () => {
    expect(historyName("///", new Date(2026, 10, 15, 9, 4, 7))).toBe("audio-26-11-15_09-04-07.mp3")
  })

  test("keeps at most forty characters of the description", () => {
    const name = historyName("a".repeat(60), new Date(2026, 10, 15, 9, 4, 7))
    expect(name.startsWith("a".repeat(40))).toBe(true)
    expect(name.startsWith("a".repeat(41))).toBe(false)
  })
})

describe("historySplit", () => {
  test("splits a name into its description and its stamp", () => {
    expect(historySplit("Hola-mundo-26-11-15_09-04-07.mp3")).toEqual({
      description: "Hola-mundo",
      stamp: "26-11-15_09-04-07",
    })
  })

  test("keeps the whole name when there is no stamp", () => {
    expect(historySplit("notas.mp3")).toEqual({ description: "notas.mp3", stamp: "" })
  })

  test("reads a duplicated name", () => {
    expect(historySplit("Hola-26-11-15_09-04-07-2.mp3").stamp).toBe("26-11-15_09-04-07")
  })
})

describe("speakCommand", () => {
  const request: SpeakRequest = {
    text: "hola",
    voice: "es-AR-ElenaNeural",
    speed: SPEED,
    controlPath: "C:/tmp/control.txt",
    savePath: "C:/tmp/history/audio.mp3",
  }

  test("runs the PowerShell engine on Windows", () => {
    const command = speakCommand({ platform: "win32", root: "C:/plugin", python: "python.exe", request })
    expect(command.argv[0]).toBe(POWERSHELL)
    expect(command.argv.at(-1)?.replaceAll("\\", "/")).toBe("C:/plugin/engine/speak.ps1")
  })

  test("runs the Python engine everywhere else", () => {
    const command = speakCommand({ platform: "darwin", root: "/plugin", python: "/venv/bin/python", request })
    expect(command.argv).toEqual(["/venv/bin/python", "/plugin/engine/speak.py"])
  })

  test("passes the engine contract through the environment", () => {
    const command = speakCommand({ platform: "darwin", root: "/plugin", python: "/venv/bin/python", request })
    expect(command.env).toEqual({
      NARRATOR_TEXT: "hola",
      NARRATOR_VOICE: "es-AR-ElenaNeural",
      NARRATOR_SPEED: "1.3",
      NARRATOR_CONTROL: "C:/tmp/control.txt",
      NARRATOR_PYTHON: "/venv/bin/python",
      NARRATOR_SAVE_AS: "C:/tmp/history/audio.mp3",
    })
  })

  test("a narration only made is asked so; one spoken is not", () => {
    const command = speakCommand({ platform: "win32", root: "C:/plugin", python: "python.exe", request: { ...request, isOnlyMade: true } })
    expect(command.env.NARRATOR_ONLY_MAKE).toBe("1")
    expect(speakCommand({ platform: "win32", root: "C:/plugin", python: "python.exe", request }).env.NARRATOR_ONLY_MAKE).toBeUndefined()
  })

  test("omits the history target when the narration is not kept", () => {
    const command = speakCommand({
      platform: "darwin",
      root: "/plugin",
      python: "/venv/bin/python",
      request: { ...request, savePath: undefined },
    })
    expect(command.env.NARRATOR_SAVE_AS).toBeUndefined()
  })
})

/** A speaker whose output the test releases by hand. */
function gatedSpeaker(chunks: readonly string[]) {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const state = {
    request: undefined as SpeakRequest | undefined,
    stopped: false,
    release,
  }
  const speak = (request: SpeakRequest): SpeakingProcess => {
    state.request = request
    return {
      stop: () => {
        state.stopped = true
      },
      output: (async function* () {
        for (const chunk of chunks) {
          if (chunk === "<gate>") {
            await gate
            continue
          }
          yield chunk
        }
      })(),
    }
  }
  return { speak, state }
}

async function flush() {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("Narration", () => {
  test("goes thinking, playing and idle as the engine reports", async () => {
    const speaker = gatedSpeaker(["", "voice es-AR-ElenaNeural\n", "..\n"])
    const states: string[] = []
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => "audio.mp3",
      writeControl: async () => {},
      onState: (state) => states.push(state),
    })

    await narration.narrate({ text: "hola", voice: "es-AR-ElenaNeural" })

    expect(states).toEqual(["idle", "thinking", "playing", "idle"])
    expect(speaker.state.request?.speed).toBe(SPEED)
    expect(speaker.state.request?.savePath).toBe("audio.mp3")
    expect(narration.state).toBe("idle")
  })

  test("for the popup it is only made, when it is kept: it says whether it was, and never shows as playing", async () => {
    const speaker = gatedSpeaker(["", ".\n", "made\n"])
    const states: string[] = []
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => "audio.mp3",
      writeControl: async () => {},
      onState: (state) => states.push(state),
    })
    expect(await narration.narrate({ text: "hola", voice: "x", isOnlyMade: true })).toBe(true)
    expect(speaker.state.request?.isOnlyMade).toBe(true)
    expect(states).toEqual(["idle", "thinking", "idle"])
    // Not kept, there is no file for the popup: it is spoken.
    const spoken = gatedSpeaker(["voice x\n"])
    const aloud = new Narration({ speak: spoken.speak, controlPath: () => "control.txt", savePath: () => undefined, writeControl: async () => {}, onState: () => {} })
    expect(await aloud.narrate({ text: "hola", voice: "x", isOnlyMade: true })).toBe(false)
    expect(spoken.state.request?.isOnlyMade).toBe(false)
  })

  test("pauses and goes on through the control file", async () => {
    const speaker = gatedSpeaker(["voice x\n", "<gate>", ".\n"])
    const writes: Array<[string, string]> = []
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async (path, asked) => {
        writes.push([path, asked])
      },
      onState: () => {},
    })

    const running = narration.narrate({ text: "hola", voice: "x" })
    await flush()
    expect(narration.state).toBe("playing")

    await narration.pause()
    expect(narration.state).toBe("paused")
    await narration.resume()
    expect(narration.state).toBe("playing")

    speaker.state.release()
    await running
    expect(narration.state).toBe("idle")
    expect(writes).toEqual([
      ["control.txt", "play"],
      ["control.txt", "pause"],
      ["control.txt", "play"],
    ])
  })

  test("stops the engine and clears the control file", async () => {
    const speaker = gatedSpeaker(["voice x\n", "<gate>"])
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {},
      onState: () => {},
    })

    const running = narration.narrate({ text: "hola", voice: "x" })
    await flush()
    await narration.stop()

    expect(speaker.state.stopped).toBe(true)
    expect(narration.state).toBe("idle")

    speaker.state.release()
    await running
    expect(narration.state).toBe("idle")
  })

  test("does nothing for empty text", async () => {
    const speaker = gatedSpeaker(["voice x\n"])
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {},
      onState: () => {},
    })

    await narration.narrate({ text: "   ", voice: "x" })

    expect(speaker.state.request).toBeUndefined()
    expect(narration.state).toBe("idle")
  })

  test("ends idle when the engine fails", async () => {
    const narration = new Narration({
      speak: () => ({
        stop: () => {},
        output: (async function* () {
          throw new Error("edge-tts failed")
        })(),
      }),
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {},
      onState: () => {},
    })

    await narration.narrate({ text: "hola", voice: "x" })
    expect(narration.state).toBe("idle")
  })

  test("removes the control file once the narration ends", async () => {
    const speaker = gatedSpeaker(["voice x\n", "."])
    const removed: string[] = []
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {},
      removeControl: async (path) => {
        removed.push(path)
      },
      onState: () => {},
    })

    await narration.narrate({ text: "hola", voice: "x" })

    expect(removed).toEqual(["control.txt"])
  })

  test("removes the control file when the narration is stopped", async () => {
    const speaker = gatedSpeaker(["voice x\n", "<gate>"])
    const removed: string[] = []
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {},
      removeControl: async (path) => {
        removed.push(path)
      },
      onState: () => {},
    })

    const running = narration.narrate({ text: "hola", voice: "x" })
    await flush()
    await narration.stop()

    expect(removed).toEqual(["control.txt"])

    speaker.state.release()
    await running
    expect(removed).toEqual(["control.txt"])
  })

  test("reports a control write failure instead of rejecting", async () => {
    const speaker = gatedSpeaker(["voice x\n"])
    const errors: string[] = []
    const states: string[] = []
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {
        throw new Error("read-only data directory")
      },
      onState: (state) => states.push(state),
      onError: (message) => errors.push(message),
    })

    await narration.narrate({ text: "hola", voice: "x" })

    expect(errors).toEqual(["read-only data directory"])
    expect(speaker.state.request).toBeUndefined()
    expect(narration.state).toBe("idle")
    expect(states).toEqual(["idle", "thinking", "idle"])
  })

  test("caps the narrated text so the engine environment stays bounded", async () => {
    const speaker = gatedSpeaker(["voice x\n"])
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {},
      onState: () => {},
    })

    await narration.narrate({ text: "a".repeat(MAX_TEXT + 5000), voice: "x" })

    expect(speaker.state.request?.text).toHaveLength(MAX_TEXT)
  })
})

describe("Narration output", () => {
  test("recognizes a voice line split across two chunks", async () => {
    const speaker = gatedSpeaker(["vo", "ice es-AR-ElenaNeural\n"])
    const states: string[] = []
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {},
      onState: (state) => states.push(state),
    })

    await narration.narrate({ text: "hola", voice: "x" })

    expect(states).toContain("playing")
  })

  test("reports an error line split across two chunks", async () => {
    const speaker = gatedSpeaker(["err", "or edge-tts failed\n"])
    const errors: string[] = []
    const narration = new Narration({
      speak: speaker.speak,
      controlPath: () => "control.txt",
      savePath: () => undefined,
      writeControl: async () => {},
      onState: () => {},
      onError: (message) => errors.push(message),
    })

    await narration.narrate({ text: "hola", voice: "x" })

    expect(errors).toEqual(["edge-tts failed"])
  })

  test("starting a second narration while the first starts leaves one engine", async () => {
    const speaker = gatedSpeaker(["voice x\n"])
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let spawns = 0
    let controls = 0
    const narration = new Narration({
      speak: (request) => {
        spawns += 1
        return speaker.speak(request)
      },
      controlPath: () => `control-${++controls}.txt`,
      savePath: () => undefined,
      writeControl: async (_path, asked) => {
        if (controls === 1 && asked === "play") await gate
      },
      onState: () => {},
    })

    const first = narration.narrate({ text: "uno", voice: "x" })
    await flush()
    const second = narration.narrate({ text: "dos", voice: "x" })
    release()
    await Promise.all([first, second])

    expect(spawns).toBe(1)
    expect(speaker.state.request?.text).toBe("dos")
  })
})
